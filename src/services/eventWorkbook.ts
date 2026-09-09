// Runtime Excel downloads/imports in the app, using its existing spreadsheet engine.
import * as XLSX from 'xlsx';
import { db } from '../db/dexieDb';
import type { RaceEvent, RaceProfile, Category, Wave, Participant, RaceLegConfig } from '../types';
import { classifyParticipant, competitionAge } from './participantClassification';
import { generateUUID } from './operationService';
import { createFullSnapshot } from './backupService';

export interface WorkbookData { event: RaceEvent; profiles: RaceProfile[]; categories: Category[]; waves: Wave[]; participants: Participant[] }
const columns = {
  Evenement: ['Naam', 'Datum', 'Locatie', 'Organisatie'],
  Profielen: ['Code', 'Naam', 'Beschrijving', 'Artikelen', 'Strafseconden per misser', 'Strafrondes per misser'],
  Parcours: ['Profielcode', 'Volgorde', 'Naam', 'Type', 'Afstand meters', 'Ronden', 'Schoten', 'Houding', 'Straftype', 'Strafseconden', 'Strafrondes'],
  Categorieen: ['Code', 'Naam', 'Geslacht', 'Minimumleeftijd', 'Maximumleeftijd', 'Profielcodes'],
  Startgroepen: ['Code', 'Naam', 'Nummer', 'Startuur', 'Maximum deelnemers', 'Categoriecodes'],
  Deelnemers: ['Deelnemer-ID', 'Voornaam', 'Achternaam', 'Geboortedatum', 'Geslacht', 'Artikel', 'Borstnummer', 'Club', 'E-mail', 'Telefoon', 'Opmerkingen', 'Categoriecode', 'Profielcode', 'Startgroepcode', 'Categorie indeling', 'Profiel indeling', 'Ingeschreven op', 'Extern ID', 'Leeftijd op 31 december'],
};
const list = (value: unknown) => String(value ?? '').split('|').map(s => s.trim()).filter(Boolean);
const text = (value: unknown) => String(value ?? '').trim();
function dateText(value: unknown) { return value instanceof Date ? value.toISOString().slice(0, 10) : text(value); }

export async function currentWorkbookData(): Promise<WorkbookData> {
  return db.transaction('r', [db.events, db.raceProfiles, db.categories, db.waves, db.participants], async () => {
    const event = await db.events.toCollection().first();
    if (!event) throw new Error('Maak eerst een evenement aan.');
    return { event, profiles: await db.raceProfiles.toArray(), categories: await db.categories.toArray(), waves: await db.waves.toArray(), participants: await db.participants.toArray() };
  });
}

export function buildEventWorkbook(data: WorkbookData, blank = false) {
  const book = XLSX.utils.book_new();
  const sheet = (name: string, headers: string[], rows: unknown[][]) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map(h => ({ wch: Math.min(42, Math.max(20, h.length + 3)) }));
    if (name !== 'Lees mij') ws['!autofilter'] = { ref: ws['!ref']! };
    XLSX.utils.book_append_sheet(book, ws, name);
  };
  sheet('Lees mij', ['Onderdeel', 'Uitleg'], [
    ['Versie', 'BIATHLON-WERKBESTAND-1'],
    ['Gebruik', 'Bewerk de tabbladen en upload via Deelnemers > Excel-werkbestand. Eerst verschijnt een controleoverzicht.'],
    ['Volgorde', 'Evenement > Profielen > Parcours > Categorieen > Startgroepen > Deelnemers. Stamhoofd is niet nodig.'],
    ['Codes', 'Kies unieke codes zoals kort, lang, U12 en wave1. Gebruik dezelfde codes in verwijzingen. Laat bestaande codes en Deelnemer-ID staan.'],
    ['Meerdere waarden', 'Scheid artikelen, profielcodes en categoriecodes met |. Artikelnamen moeten exact overeenkomen.'],
    ['Leeftijd', 'Leeftijd = evenementjaar min geboortejaar. De geboortedatum mag YYYY-MM-DD of DD/MM/YYYY zijn.'],
    ['Automatische indeling', 'Laat Categorie indeling en Profiel indeling leeg of vul automatic in. Categorie volgt leeftijd/geslacht; profiel volgt artikel EN categorie.'],
    ['Handmatige indeling', 'Vul manual in bij de betreffende indeling en kies een bestaande categoriecode/profielcode.'],
    ['Geslacht', 'Deelnemers: M, F of X. Categorieen: M, F of ALL.'],
    ['Parcours', 'Een rij per onderdeel. Type: RUN, SHOOT, PENALTY, TRANSITION of FINISH. Volgorde: 1, 2, 3... per profiel.'],
    ['Schieten', 'Schoten: positief geheel getal. Houding: prone, standing of free. Straftype: time, lap, fixed of none.'],
    ['Startuur', 'Tekst in HH:mm:ss, bijvoorbeeld 10:00:00. Startgroepen zijn optioneel.'],
    ['Nieuwe deelnemer', 'Laat Deelnemer-ID leeg voor nieuwe personen. Een ingevuld bestaand ID werkt die deelnemer bij. Lege borstnummers blijven leeg.'],
    ['Herimport', 'Rijen worden toegevoegd of bijgewerkt; een rij verwijderen in Excel verwijdert niets uit de app. Fouten blokkeren de hele import.'],
    ['Tijdens de wedstrijd', 'Import is alleen mogelijk voordat tijden/schietresultaten of gestarte waves bestaan.'],
    ['Back-up', 'Dit is een bewerkbaar bestand voor de wedstrijdvoorbereiding. Gebruik de volledige JSON-back-up voor tijden, schietresultaten, logs en exact herstel.'],
    ['Privacy', 'Een ingevuld werkbestand bevat persoonsgegevens. Bewaar het bij de organisatie.'],
  ]);
  book.Sheets['Lees mij']['!cols'] = [{ wch: 25 }, { wch: 120 }];
  const { event, profiles, categories, waves, participants } = data;
  sheet('Evenement', columns.Evenement, [[blank ? '' : event.name, blank ? '' : event.date, blank ? '' : event.location, blank ? '' : event.organizer]]);
  sheet('Profielen', columns.Profielen, blank ? [] : profiles.map(p => [p.id, p.name, p.description, p.articles?.join('|'), p.penaltySecondsPerMiss, p.penaltyLapsPerMiss]));
  sheet('Parcours', columns.Parcours, blank ? [] : profiles.flatMap(p => p.legs.map((l, i) => [p.id, i + 1, l.name, l.type, l.distanceMeters, l.laps, l.shotCount, l.stance, l.penaltyType, l.penaltyValueSeconds, l.penaltyLapsPerMiss])));
  sheet('Categorieen', columns.Categorieen, blank ? [] : categories.map(c => [c.id, c.name, c.gender, c.minAge, c.maxAge, (c.raceProfileIds ?? [c.raceProfileId]).filter(Boolean).join('|')]));
  sheet('Startgroepen', columns.Startgroepen, blank ? [] : waves.map(w => [w.id, w.name, w.waveNumber, w.scheduledStartTime, w.maxParticipants, w.categoryIds.join('|')]));
  sheet('Deelnemers', columns.Deelnemers, blank ? [] : participants.map(p => [p.id, p.firstName, p.lastName, p.birthDate, p.gender, p.article ?? p.stamhoofdRegistration?.product, p.bibNumber, p.club, p.email, p.phone, p.notes, p.categoryId, p.raceProfileId, p.waveId, p.categoryAssignment ?? 'manual', p.profileAssignment ?? 'manual', p.createdAt, p.externalId, competitionAge(p.birthDate, event.date)]));
  // Editable dates remain text, and the age is recalculated by Excel from the event date.
  if (!blank) participants.forEach((p, i) => {
    const birth = p.birthDate;
    if (/^\d{4}-\d{2}-\d{2}$/.test(birth ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
      book.Sheets.Deelnemers[`S${i + 2}`] = { t: 'n', f: `IF(OR(D${i + 2}="",'Evenement'!B2=""),"",VALUE(LEFT('Evenement'!B2,4))-VALUE(LEFT(D${i + 2},4)))`, v: competitionAge(birth, event.date) };
    }
  });
  return book;
}

export function downloadEventWorkbook(data: WorkbookData, blank: boolean) {
  XLSX.writeFile(buildEventWorkbook(data, blank), blank ? 'biathlon-blanco-werkbestand.xlsx' : `biathlon-werkbestand-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
export function readEventWorkbook(buffer: ArrayBuffer) { return XLSX.read(buffer, { type: 'array', cellDates: true }); }

export function planEventWorkbook(book: XLSX.WorkBook, current: WorkbookData) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const now = new Date().toISOString();
  const rows = (name: keyof typeof columns): Record<string, any>[] => {
    const ws = book.Sheets[name];
    if (!ws) { errors.push(`Tabblad ${name} ontbreekt.`); return []; }
    const header = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 })[0] ?? [];
    if (!columns[name].every(h => header.includes(h))) errors.push(`${name}: kolomnamen gewijzigd of ontbrekend. Gebruik het originele sjabloon.`);
    return XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' }).filter(r => Object.values(r).some(v => text(v)));
  };
  const number = (v: unknown, label: string, fallback?: number) => {
    if (text(v) === '') return fallback;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) { errors.push(`${label}: verwacht een positief geheel getal of nul.`); return fallback; }
    return n;
  };
  const choice = (v: unknown, values: string[], label: string, fallback: string) => {
    const t = text(v) || fallback;
    if (!values.includes(t)) errors.push(`${label}: gebruik ${values.join(', ')}.`);
    return t;
  };
  const merge = <T extends { id: string }>(old: T[], incoming: T[]) => {
    const ids = new Set<string>();
    incoming.forEach(v => { if (!v.id || ids.has(v.id)) errors.push(`Lege of dubbele code: ${v.id || '(leeg)'}.`); ids.add(v.id); });
    return [...new Map([...old, ...incoming].map(v => [v.id, v])).values()];
  };
  const eventRows = rows('Evenement');
  if (eventRows.length !== 1) errors.push('Evenement: vul precies een rij in.');
  const e = eventRows[0] ?? {};
  const event = { ...current.event, name: text(e.Naam), date: dateText(e.Datum), location: text(e.Locatie), organizer: text(e.Organisatie), updatedAt: now };
  if (!event.name || !/^\d{4}-\d{2}-\d{2}$/.test(event.date) || competitionAge(event.date, event.date) === undefined) errors.push('Evenement: naam en geldige datum YYYY-MM-DD zijn verplicht.');
  const legs = rows('Parcours');
  const incomingProfiles: RaceProfile[] = rows('Profielen').map(r => {
    const code = text(r.Code);
    const ordered = legs.filter(l => text(l.Profielcode) === code).sort((a, b) => Number(a.Volgorde) - Number(b.Volgorde));
    const orders = ordered.map(l => number(l.Volgorde, `${code}: volgorde`));
    if (!ordered.length || orders.some(n => !n) || new Set(orders).size !== orders.length) errors.push(`${code}: parcours ontbreekt of volgorde is ongeldig/dubbel.`);
    if (!text(r.Naam)) errors.push(`${code}: profielnaam ontbreekt.`);
    return { ...current.profiles.find(p => p.id === code), id: code, name: text(r.Naam), description: text(r.Beschrijving), articles: list(r.Artikelen), penaltySecondsPerMiss: number(r['Strafseconden per misser'], code, 20)!, penaltyLapsPerMiss: number(r['Strafrondes per misser'], code, 1)!, legs: ordered.map((l, index) => {
      const type = choice(l.Type, ['RUN', 'SHOOT', 'PENALTY', 'TRANSITION', 'FINISH'], code, 'RUN') as RaceLegConfig['type'];
      const shotCount = type === 'SHOOT' ? number(l.Schoten, code, 5) : undefined;
      if (type === 'SHOOT' && !shotCount) errors.push(`${code}: een schietproef moet minstens een schot hebben.`);
      const priorLeg = current.profiles.find(p => p.id === code)?.legs[index];
      return { ...priorLeg, id: priorLeg?.id ?? `${code}-${l.Volgorde}`, type, name: text(l.Naam) || type, distanceMeters: number(l['Afstand meters'], code), laps: number(l.Ronden, code), shotCount, stance: choice(l.Houding, ['prone', 'standing', 'free'], code, 'free') as RaceLegConfig['stance'], penaltyType: choice(l.Straftype, ['time', 'lap', 'fixed', 'none'], code, 'time') as RaceLegConfig['penaltyType'], penaltyValueSeconds: number(l.Strafseconden, code), penaltyLapsPerMiss: number(l.Strafrondes, code) };
    }) };
  });
  const profiles = merge(current.profiles, incomingProfiles);
  for (const l of legs) if (!incomingProfiles.some(p => p.id === text(l.Profielcode))) errors.push(`Parcours: profiel ${l.Profielcode} ontbreekt op tabblad Profielen.`);
  const incomingCategories: Category[] = rows('Categorieen').map(r => ({ ...current.categories.find(c => c.id === text(r.Code)), id: text(r.Code), code: text(r.Code), name: text(r.Naam), gender: choice(r.Geslacht, ['M', 'F', 'ALL'], text(r.Code), 'ALL') as Category['gender'], minAge: number(r.Minimumleeftijd, text(r.Code)), maxAge: number(r.Maximumleeftijd, text(r.Code)), raceProfileIds: list(r.Profielcodes) }));
  const categories = merge(current.categories, incomingCategories);
  for (const c of categories) {
    if (!c.name || (c.minAge ?? 0) > (c.maxAge ?? Infinity)) errors.push(`${c.id}: categorienaam of leeftijdsbereik ongeldig.`);
    for (const id of c.raceProfileIds) if (!profiles.some(p => p.id === id)) errors.push(`${c.name}: onbekende profielcode ${id}.`);
  }
  const incomingWaves: Wave[] = rows('Startgroepen').map(r => ({ ...current.waves.find(w => w.id === text(r.Code)), id: text(r.Code), eventId: event.id, name: text(r.Naam), waveNumber: number(r.Nummer, text(r.Code), 1)!, scheduledStartTime: typeof r.Startuur === 'number' ? new Date(Math.round(r.Startuur * 86400000)).toISOString().slice(11, 19) : r.Startuur instanceof Date ? r.Startuur.toISOString().slice(11, 19) : text(r.Startuur), maxParticipants: number(r['Maximum deelnemers'], text(r.Code), 25)!, categoryIds: list(r.Categoriecodes), status: 'SCHEDULED' }));
  const waves = merge(current.waves, incomingWaves);
  for (const w of waves) {
    if (!w.name || !w.waveNumber || !w.maxParticipants || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(w.scheduledStartTime)) errors.push(`${w.id}: naam, nummer, capaciteit of startuur ongeldig (HH:mm:ss).`);
    for (const id of w.categoryIds) if (!categories.some(c => c.id === id)) errors.push(`${w.name}: onbekende categoriecode ${id}.`);
  }
  const incomingParticipants: Participant[] = rows('Deelnemers').map((r, index) => {
    const label = `Deelnemers rij ${index + 2}`;
    const id = text(r['Deelnemer-ID']) || generateUUID();
    const existing = current.participants.find(p => p.id === id);
    const categoryAssignment = choice(r['Categorie indeling'], ['automatic', 'manual'], label, 'automatic') as Participant['categoryAssignment'];
    const profileAssignment = choice(r['Profiel indeling'], ['automatic', 'manual'], label, 'automatic') as Participant['profileAssignment'];
    const inscription = r['Ingeschreven op'] instanceof Date ? r['Ingeschreven op'].toISOString() : text(r['Ingeschreven op']);
    const p: Participant = { ...existing, id, firstName: text(r.Voornaam), lastName: text(r.Achternaam), birthDate: dateText(r.Geboortedatum), gender: choice(r.Geslacht, ['M', 'F', 'X'], label, 'X') as Participant['gender'], article: text(r.Artikel), bibNumber: number(r.Borstnummer, label), club: text(r.Club), email: text(r['E-mail']), phone: text(r.Telefoon), notes: text(r.Opmerkingen), categoryId: text(r.Categoriecode), raceProfileId: text(r.Profielcode), waveId: text(r.Startgroepcode) || undefined, categoryAssignment, profileAssignment, externalId: text(r['Extern ID']) || undefined, createdAt: inscription || existing?.createdAt || now, updatedAt: now, status: existing?.status ?? 'READY' };
    if (!p.firstName || !p.lastName) errors.push(`${label}: voornaam en achternaam zijn verplicht.`);
    if (p.birthDate && competitionAge(p.birthDate, event.date) === undefined) errors.push(`${label}: ongeldige geboortedatum.`);
    if (p.bibNumber === 0) errors.push(`${label}: borstnummer moet positief zijn of leeg blijven.`);
    if (isNaN(Date.parse(p.createdAt))) errors.push(`${label}: ongeldige inschrijfdatum.`);
    if (!existing && current.participants.some(old => old.firstName === p.firstName && old.lastName === p.lastName && old.birthDate === p.birthDate)) errors.push(`${label}: persoon bestaat mogelijk al. Gebruik het Deelnemer-ID uit de ingevulde export.`);
    const assigned = classifyParticipant(p, event.date, categories, profiles);
    p.categoryId = assigned.categoryId; p.raceProfileId = assigned.raceProfileId;
    assigned.issues.forEach(issue => warnings.push(`${label} ${p.firstName}: ${issue}`));
    if (categoryAssignment === 'manual' && !categories.some(c => c.id === p.categoryId)) errors.push(`${label}: onbekende handmatige categorie.`);
    if (profileAssignment === 'manual' && !profiles.some(pr => pr.id === p.raceProfileId)) errors.push(`${label}: onbekend handmatig profiel.`);
    if (p.waveId && !waves.some(w => w.id === p.waveId)) errors.push(`${label}: onbekende startgroep.`);
    return p;
  });
  const participants = merge(current.participants, incomingParticipants).map(p => {
    if (incomingParticipants.some(row => row.id === p.id)) return p;
    const assigned = classifyParticipant({ ...p, categoryAssignment: p.categoryAssignment ?? 'manual', profileAssignment: p.profileAssignment ?? 'manual' }, event.date, categories, profiles);
    assigned.issues.forEach(issue => warnings.push(`${p.firstName} ${p.lastName}: ${issue}`));
    return { ...p, categoryId: assigned.categoryId, raceProfileId: assigned.raceProfileId };
  });
  for (const p of participants) {
    const category = categories.find(c => c.id === p.categoryId);
    if (category && p.raceProfileId && !category.raceProfileIds.includes(p.raceProfileId)) errors.push(`${p.firstName} ${p.lastName}: profiel is niet toegelaten voor de categorie.`);
  }
  const bibs = participants.map(p => p.bibNumber).filter(n => n !== undefined);
  if (new Set(bibs).size !== bibs.length) errors.push('Dubbele borstnummers in het uiteindelijke deelnemersbestand.');
  for (const w of waves) {
    const assigned = participants.filter(p => p.waveId === w.id);
    if (assigned.length > w.maxParticipants) errors.push(`${w.name}: capaciteit overschreden.`);
    if (w.categoryIds.length && assigned.some(p => !w.categoryIds.includes(p.categoryId))) errors.push(`${w.name}: deelnemer past niet in de toegelaten categorieen.`);
  }
  return { data: { event, profiles, categories, waves, participants }, errors, warnings, imported: incomingParticipants.length };
}

export async function applyEventWorkbook(book: XLSX.WorkBook, expected: string) {
  const before = await currentWorkbookData();
  if (JSON.stringify(before) !== expected) throw new Error('De gegevens zijn intussen gewijzigd. Bekijk het importbestand opnieuw.');
  await createFullSnapshot(before.event);
  return db.transaction('rw', [db.events, db.participants, db.raceProfiles, db.categories, db.waves, db.timingRecords, db.shootingResults, db.operations, db.auditLogs], async () => {
    const fresh = await currentWorkbookData();
    if (JSON.stringify(fresh) !== expected) throw new Error('Gegevens gewijzigd; maak opnieuw een controleoverzicht.');
    if (fresh.event.officialResultsLocked || ['LIVE', 'FINISHED', 'ARCHIVED'].includes(fresh.event.status) || await db.timingRecords.count() || await db.shootingResults.count() || fresh.waves.some(w => w.status !== 'SCHEDULED') || fresh.participants.some(p => ['STARTED', 'FINISHED'].includes(p.status))) throw new Error('Excel-import is alleen beschikbaar voor de wedstrijd, zonder tijden of schietresultaten.');
    const plan = planEventWorkbook(book, fresh);
    if (plan.errors.length) throw new Error(plan.errors.join('\n'));
    const d = plan.data;
    await db.events.put(d.event); await db.raceProfiles.bulkPut(d.profiles); await db.categories.bulkPut(d.categories); await db.waves.bulkPut(d.waves); await db.participants.bulkPut(d.participants);
    await db.auditLogs.add({ id: generateUUID(), timestamp: new Date().toISOString(), deviceId: 'EXCEL', operator: 'Beheerder', action: 'EXCEL_WORKBOOK_IMPORTED', details: `${plan.imported} deelnemers verwerkt met profielen, categorieen en startgroepen.` });
    return plan;
  });
}
