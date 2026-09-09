import * as XLSX from 'xlsx';
import type { ImportColumnMapping, Participant } from '../types';

export interface RawParsedRow {
  rowIndex: number;
  sheetName?: string;
  data: Record<string, string>;
}

export interface SheetInfo {
  name: string;
  rowCount: number;
  headers: string[];
  rows: RawParsedRow[];
}

export interface ParseResult {
  headers: string[];
  rows: RawParsedRow[];
  detectedDelimiter?: string;
  fileName: string;
  isExcel?: boolean;
  sheets?: SheetInfo[];
  selectedSheetNames?: string[];
}

export interface ParticipantImportCandidate {
  rowIndex: number;
  sheetName?: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
  gender?: 'M' | 'F' | 'X';
  email?: string;
  phone?: string;
  categoryName?: string;
  categorySource?: 'column' | 'sheet' | 'default';
  club?: string;
  bibNumber?: number;
  externalId?: string;
  notes?: string;
  isValid: boolean;
  validationErrors: string[];
  isDuplicate: boolean;
  duplicateReason?: string;
  existingParticipantId?: string;
}

const SYNONYMS: Record<keyof ImportColumnMapping, string[]> = {
  firstName: ['voornaam', 'first name', 'firstname', 'prenom', 'first'],
  lastName: ['achternaam', 'last name', 'lastname', 'familienaam', 'nom', 'familiynaam'],
  fullName: ['volledige naam', 'full name', 'naam atleet', 'deelnemer'],
  bibNumber: ['startnummer', 'bib', 'bib number', 'bibnumber', 'rugnummer', 'nummer'],
  category: ['categorie', 'category', 'leeftijdscategorie', 'reeks', 'groep', 'product', 'activiteit', 'afstand'],
  birthDate: ['geboortedatum', 'birthdate', 'birth date', 'dob', 'geboorte', 'date of birth'],
  gender: ['geslacht', 'gender', 'sexe', 'm/v'],
  email: ['e-mail', 'email', 'mail', 'e-mailadres', 'email address'],
  phone: ['telefoon', 'phone', 'gsm', 'telefoonnummer', 'mobiel', 'contact'],
  club: ['club', 'vereniging', 'ploeg', 'team', 'sportclub'],
  team: ['team', 'groep', 'ploeg'],
  externalId: ['stamhoofd id', 'stamhoofd', 'id', 'inschrijvingsnummer', 'bestelnummer', 'order id', 'ticket id'],
  notes: ['opmerkingen', 'notes', 'opmerking', 'bijzonderheden', 'comment'],
};

export function extractBaseHeader(col?: string): string {
  if (!col) return '';
  let cleaned = col.replace(/^\[[^\]]+\]\s*/, '');
  cleaned = cleaned.replace(/\s*\((?:alle tabbladen|alle sheets|gezamenlijk)\)$/i, '');
  return cleaned.trim();
}

export function getMappedValue(row: RawParsedRow, mappedKey?: string): string {
  if (!mappedKey) return '';

  // 1. Direct exact key match
  if (row.data[mappedKey] !== undefined && row.data[mappedKey] !== '') {
    return row.data[mappedKey];
  }

  // 2. Base header extraction
  const baseHeader = extractBaseHeader(mappedKey);
  if (!baseHeader) return '';

  // 2a. Direct base header in row.data
  if (row.data[baseHeader] !== undefined && row.data[baseHeader] !== '') {
    return row.data[baseHeader];
  }

  // 2b. If this row has its own sheet-prefixed version: [sheetName] baseHeader
  if (row.sheetName) {
    const sheetKey = `[${row.sheetName}] ${baseHeader}`;
    if (row.data[sheetKey] !== undefined && row.data[sheetKey] !== '') {
      return row.data[sheetKey];
    }
    const hyphenKey = `${row.sheetName} - ${baseHeader}`;
    if (row.data[hyphenKey] !== undefined && row.data[hyphenKey] !== '') {
      return row.data[hyphenKey];
    }
  }

  // 2c. Case-insensitive fallback
  const lowerBase = baseHeader.toLowerCase();
  for (const [k, v] of Object.entries(row.data)) {
    if (v && extractBaseHeader(k).toLowerCase() === lowerBase) {
      return v;
    }
  }

  return '';
}

export function autoDetectMapping(headers: string[]): ImportColumnMapping {
  const mapping: ImportColumnMapping = {};
  const baseLowerHeaders = headers.map((h) => extractBaseHeader(h).toLowerCase());
  const lowerHeaders = headers.map((h) => h.trim().toLowerCase());

  (Object.keys(SYNONYMS) as Array<keyof ImportColumnMapping>).forEach((field) => {
    const syns = SYNONYMS[field];

    // Pass 1: exact match on base header
    let matched = headers.find((_, i) => syns.includes(baseLowerHeaders[i]));

    // Pass 2: substring match on base header
    if (!matched) {
      matched = headers.find((_, i) => {
        const base = baseLowerHeaders[i];
        if (!base) return false;
        return syns.some((s) => base === s || base.includes(s) || (s.length > 3 && s.includes(base)));
      });
    }

    // Pass 3: fallback to full header
    if (!matched) {
      matched = headers.find((_, i) => {
        const full = lowerHeaders[i];
        return syns.some((s) => full.includes(s));
      });
    }

    if (matched) {
      mapping[field] = matched;
    }
  });

  return mapping;
}

/**
 * Combines rows and headers across selected sheets.
 * When multiple sheets exist, duplicate headers across sheets are distinguished
 * by prefixing the tabblad name: "[Tabblad] Kopnaam".
 */
export function combineSheets(
  allSheets: SheetInfo[],
  selectedNames?: string[]
): { headers: string[]; rows: RawParsedRow[]; sheetNames: string[]; duplicateHeaders: string[] } {
  const chosenSheets =
    selectedNames && selectedNames.length > 0
      ? allSheets.filter((s) => selectedNames.includes(s.name))
      : allSheets.filter((s) => s.rowCount > 0).length > 0
      ? allSheets.filter((s) => s.rowCount > 0)
      : allSheets;

  const chosenSheetNames = chosenSheets.map((s) => s.name);

  // Count how many sheets contain each base header
  const headerToSheets = new Map<string, string[]>();
  chosenSheets.forEach((sheet) => {
    sheet.headers.forEach((h) => {
      const list = headerToSheets.get(h) || [];
      if (!list.includes(sheet.name)) list.push(sheet.name);
      headerToSheets.set(h, list);
    });
  });

  const duplicateHeaders = Array.from(headerToSheets.entries())
    .filter(([_, sheets]) => sheets.length > 1)
    .map(([h]) => h);

  // Build the unified list of headers
  const headerSet = new Set<string>();

  if (chosenSheets.length > 1) {
    // 1. Add unified "(alle tabbladen)" option for duplicate headers so user can map all at once
    duplicateHeaders.forEach((dh) => {
      headerSet.add(`${dh} (alle tabbladen)`);
    });

    // 2. Add sheet-specific columns mentioning tabblad and kopnaam to distinguish duplicates and origin
    chosenSheets.forEach((sheet) => {
      sheet.headers.forEach((h) => {
        const isDuplicate = (headerToSheets.get(h)?.length || 0) > 1;
        if (isDuplicate) {
          // Explicitly mention tabblad and kopnaam to distinguish duplicate header names
          headerSet.add(`[${sheet.name}] ${h}`);
        } else {
          // Unique to this sheet
          headerSet.add(`[${sheet.name}] ${h}`);
        }
      });
    });
  } else if (chosenSheets.length === 1) {
    chosenSheets[0].headers.forEach((h) => headerSet.add(h));
  }

  const headers = Array.from(headerSet);

  // Collect and re-index all rows with multi-key data access
  let globalRowIdx = 1;
  const rows: RawParsedRow[] = [];

  chosenSheets.forEach((sheet) => {
    sheet.rows.forEach((r) => {
      const data: Record<string, string> = {};

      sheet.headers.forEach((h) => {
        const val = r.data[h] !== undefined ? r.data[h] : '';
        // 1. Base header
        data[h] = val;
        // 2. Sheet bracketed: [Tabblad] Kopnaam
        data[`[${sheet.name}] ${h}`] = val;
        // 3. Sheet hyphen: Tabblad - Kopnaam
        data[`${sheet.name} - ${h}`] = val;
        // 4. All sheets alias
        data[`${h} (alle tabbladen)`] = val;
        data[`${h} (alle sheets)`] = val;
      });

      rows.push({
        rowIndex: globalRowIdx++,
        sheetName: sheet.name,
        data,
      });
    });
  });

  return {
    headers,
    rows,
    sheetNames: chosenSheetNames,
    duplicateHeaders,
  };
}

/**
 * Robustly inspects rows of a worksheet to locate the header row,
 * bypassing potential title banners or empty rows at the top.
 */
function findHeaderRow(rawRows: any[][]): { headerRowIdx: number; headers: string[] } {
  if (rawRows.length === 0) return { headerRowIdx: 0, headers: [] };

  const headerKeywords = [
    'voornaam', 'achternaam', 'naam', 'first', 'last', 'name',
    'categorie', 'category', 'reeks', 'groep', 'product', 'afstand',
    'bib', 'startnummer', 'nummer', 'rugnummer',
    'geboortedatum', 'geboorte', 'birth', 'dob',
    'geslacht', 'gender', 'sex', 'm/v',
    'email', 'e-mail', 'mail',
    'telefoon', 'phone', 'gsm', 'mobiel',
    'club', 'team', 'vereniging',
    'id', 'stamhoofd', 'ticket', 'order', 'inschrijving', 'status'
  ];

  let bestRowIdx = 0;
  let maxScore = -1;

  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    const stringCells = row.map((c) => String(c ?? '').trim()).filter((c) => c.length > 0);
    if (stringCells.length === 0) continue;

    let score = stringCells.length;
    for (const cell of stringCells) {
      const lower = cell.toLowerCase();
      if (headerKeywords.some((kw) => lower.includes(kw))) {
        score += 10;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestRowIdx = r;
    }
  }

  const rawHeaderRow = rawRows[bestRowIdx] || [];
  const headers: string[] = [];
  const seenHeaders = new Map<string, number>();

  rawHeaderRow.forEach((cell, colIdx) => {
    let text = String(cell ?? '').trim();
    if (!text) {
      let hasDataBelow = false;
      for (let r = bestRowIdx + 1; r < rawRows.length; r++) {
        if (rawRows[r]?.[colIdx] !== undefined && String(rawRows[r][colIdx]).trim() !== '') {
          hasDataBelow = true;
          break;
        }
      }
      if (hasDataBelow) {
        text = `Kolom ${colIdx + 1}`;
      } else {
        return;
      }
    }

    const count = (seenHeaders.get(text) || 0) + 1;
    seenHeaders.set(text, count);
    if (count > 1) {
      headers.push(`${text} (${count})`);
    } else {
      headers.push(text);
    }
  });

  return { headerRowIdx: bestRowIdx, headers };
}

/**
 * Parses file from File or ArrayBuffer (CSV, XLSX, XLS)
 * Supports multiple sheets/tabbladen in Excel workbooks.
 * Automatically collects all sheets and all columns.
 */
export async function parseFile(file: File): Promise<ParseResult> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'csv') {
    const text = await file.text();
    return parseCSVText(text, file.name);
  }

  // Excel (.xlsx or .xls)
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetNames = workbook.SheetNames || [];

  const sheets: SheetInfo[] = [];

  for (const sName of sheetNames) {
    const worksheet = workbook.Sheets[sName];
    if (!worksheet) continue;

    // Read sheet as 2D array of arrays
    const rawRows = (XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
    }) as any[][]) || [];

    if (rawRows.length === 0) {
      sheets.push({
        name: sName,
        rowCount: 0,
        headers: [],
        rows: [],
      });
      continue;
    }

    const { headerRowIdx, headers } = findHeaderRow(rawRows);

    if (headers.length === 0 || rawRows.length <= headerRowIdx + 1) {
      sheets.push({
        name: sName,
        rowCount: 0,
        headers,
        rows: [],
      });
      continue;
    }

    const rows: RawParsedRow[] = [];
    let sheetRowIdx = 1;

    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
      const rowArr = rawRows[r];
      if (!Array.isArray(rowArr)) continue;

      // Check if entire row is empty
      const hasAnyValue = rowArr.some((c) => c !== undefined && c !== null && String(c).trim() !== '');
      if (!hasAnyValue) continue;

      const data: Record<string, string> = {};
      headers.forEach((h, colIdx) => {
        const val = rowArr[colIdx];
        if (val instanceof Date) {
          const y = val.getFullYear();
          const m = String(val.getMonth() + 1).padStart(2, '0');
          const d = String(val.getDate()).padStart(2, '0');
          data[h] = `${y}-${m}-${d}`;
        } else {
          data[h] = String(val !== undefined && val !== null ? val : '').trim();
        }
      });

      rows.push({
        rowIndex: sheetRowIdx++,
        sheetName: sName,
        data,
      });
    }

    sheets.push({
      name: sName,
      rowCount: rows.length,
      headers,
      rows,
    });
  }

  if (sheets.length === 0) {
    return {
      headers: [],
      rows: [],
      fileName: file.name,
      isExcel: true,
      sheets: [],
      selectedSheetNames: [],
    };
  }

  // Collect ALL sheets with rows, or at least the first sheet
  const sheetsWithRows = sheets.filter((s) => s.rowCount > 0);
  const defaultSelectedNames =
    sheetsWithRows.length > 0 ? sheetsWithRows.map((s) => s.name) : sheets.map((s) => s.name);

  // Combine all columns across all selected sheets
  const combined = combineSheets(sheets, defaultSelectedNames);

  return {
    headers: combined.headers,
    rows: combined.rows,
    fileName: file.name,
    isExcel: true,
    sheets,
    selectedSheetNames: defaultSelectedNames,
  };
}

/**
 * Parses raw CSV string, auto-detecting comma, semicolon, tab, and handling UTF-8 BOM
 */
export function parseCSVText(rawText: string, fileName = 'import.csv'): ParseResult {
  // Strip UTF-8 BOM
  let text = rawText.replace(/^\uFEFF/, '');

  // Detect delimiter
  const firstLine = text.split(/\r?\n/)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let delimiter = ',';
  if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';
  if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';

  // Use simple robust CSV parser with quote escaping
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [], detectedDelimiter: delimiter, fileName };
  }

  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === delimiter && !inQuotes) {
        values.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    values.push(cur.trim());
    return values;
  };

  const headers = parseLine(lines[0]);
  const rows: RawParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const data: Record<string, string> = {};
    headers.forEach((h, hIdx) => {
      data[h] = values[hIdx] || '';
    });
    rows.push({
      rowIndex: i,
      data,
    });
  }

  return {
    headers,
    rows,
    detectedDelimiter: delimiter,
    fileName,
  };
}

/**
 * Validates parsed rows against mappings and existing participants to detect duplicates
 */
export function validateAndMapRows(
  rows: RawParsedRow[],
  mapping: ImportColumnMapping,
  existingParticipants: Participant[],
  useSheetAsCategoryFallback = true
): ParticipantImportCandidate[] {
  // Build lookup maps for duplicate detection
  const externalIdMap = new Map<string, Participant>();
  const emailMap = new Map<string, Participant>();
  const nameDobMap = new Map<string, Participant>();

  existingParticipants.forEach((p) => {
    if (p.externalId) externalIdMap.set(p.externalId.toLowerCase(), p);
    if (p.email) emailMap.set(p.email.toLowerCase(), p);
    const key = `${p.firstName.toLowerCase()}|${p.lastName.toLowerCase()}|${p.birthDate || ''}`;
    nameDobMap.set(key, p);
  });

  return rows.map((row) => {
    let firstName = mapping.firstName ? getMappedValue(row, mapping.firstName) : '';
    let lastName = mapping.lastName ? getMappedValue(row, mapping.lastName) : '';

    if (!firstName && !lastName && mapping.fullName) {
      const fullVal = getMappedValue(row, mapping.fullName);
      const parts = fullVal.split(' ');
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }

    const birthDateRaw = mapping.birthDate ? getMappedValue(row, mapping.birthDate) : undefined;
    const birthDate = birthDateRaw || undefined;

    const genderRaw = mapping.gender ? getMappedValue(row, mapping.gender).toUpperCase() : '';
    let gender: 'M' | 'F' | 'X' = 'X';
    if (
      genderRaw.startsWith('M') ||
      (genderRaw.startsWith('V') && genderRaw.includes('MAN')) ||
      genderRaw.startsWith('J') ||
      genderRaw === 'MAN' ||
      genderRaw === 'HEER' ||
      genderRaw === 'HEREN' ||
      genderRaw === 'JONGEN'
    ) {
      gender = 'M';
    } else if (
      genderRaw.startsWith('F') ||
      genderRaw.startsWith('W') ||
      genderRaw.startsWith('D') ||
      genderRaw.startsWith('V') ||
      genderRaw === 'VROUW' ||
      genderRaw === 'DAME' ||
      genderRaw === 'DAMES' ||
      genderRaw === 'MEISJE'
    ) {
      gender = 'F';
    }

    const emailRaw = mapping.email ? getMappedValue(row, mapping.email) : undefined;
    const email = emailRaw ? emailRaw.toLowerCase() : undefined;

    const phoneRaw = mapping.phone ? getMappedValue(row, mapping.phone) : undefined;
    const phone = phoneRaw || undefined;

    const catRaw = mapping.category ? getMappedValue(row, mapping.category) : '';
    let categoryName = catRaw ? catRaw.trim() : undefined;
    let categorySource: 'column' | 'sheet' | 'default' = 'column';

    // Fallback: If no category column is mapped or category cell is blank, use sheet name if available
    if ((!categoryName || categoryName === '') && useSheetAsCategoryFallback && row.sheetName) {
      categoryName = row.sheetName.trim();
      categorySource = 'sheet';
    }
    if (!categoryName) {
      categorySource = 'default';
    }

    const clubRaw = mapping.club ? getMappedValue(row, mapping.club) : undefined;
    const club = clubRaw ? clubRaw.trim() : undefined;

    const extRaw = mapping.externalId ? getMappedValue(row, mapping.externalId) : undefined;
    const externalId = extRaw ? extRaw.trim() : undefined;

    const notesRaw = mapping.notes ? getMappedValue(row, mapping.notes) : undefined;
    const notes = notesRaw ? notesRaw.trim() : undefined;

    let bibNumber: number | undefined = undefined;
    if (mapping.bibNumber) {
      const bibVal = getMappedValue(row, mapping.bibNumber);
      if (bibVal) {
        const parsed = parseInt(bibVal, 10);
        if (!isNaN(parsed) && parsed > 0) {
          bibNumber = parsed;
        }
      }
    }

    const validationErrors: string[] = [];
    if (!firstName && !lastName) {
      validationErrors.push('Naam ontbreekt');
    }
    if (!categoryName) {
      validationErrors.push('Categorie niet opgegeven');
    }

    // Duplicate detection
    let isDuplicate = false;
    let duplicateReason = '';
    let existingId: string | undefined = undefined;

    if (externalId && externalIdMap.has(externalId.toLowerCase())) {
      isDuplicate = true;
      const dup = externalIdMap.get(externalId.toLowerCase())!;
      duplicateReason = `Stamhoofd ID ${externalId} bestaat reeds (${dup.firstName} ${dup.lastName})`;
      existingId = dup.id;
    } else if (email && emailMap.has(email)) {
      isDuplicate = true;
      const dup = emailMap.get(email)!;
      duplicateReason = `E-mail ${email} bestaat reeds (${dup.firstName} ${dup.lastName})`;
      existingId = dup.id;
    } else {
      const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${birthDate || ''}`;
      if (firstName && lastName && nameDobMap.has(key)) {
        isDuplicate = true;
        const dup = nameDobMap.get(key)!;
        duplicateReason = `Atleet ${firstName} ${lastName} met dezelfde geboortedatum bestaat al`;
        existingId = dup.id;
      }
    }

    return {
      rowIndex: row.rowIndex,
      sheetName: row.sheetName,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate,
      gender,
      email,
      phone,
      categoryName: categoryName?.trim(),
      categorySource,
      club: club?.trim(),
      bibNumber,
      externalId: externalId?.trim(),
      notes,
      isValid: validationErrors.length === 0,
      validationErrors,
      isDuplicate,
      duplicateReason,
      existingParticipantId: existingId,
    };
  });
}
