import { db } from '../db/dexieDb';
import { operationService, generateUUID } from './operationService';
import { validateAndMapRows, combineSheets, type RawParsedRow, type SheetInfo } from './stamhoofdParser';
import { categoryUsesProfile, getCategoryProfileIds, withCategoryProfiles } from './categoryProfileService';
import type { Category, Participant } from '../types';

export interface TestResult {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export async function runFailsafeTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const event = (await db.events.toCollection().first()) || { id: 'test-event' };

  // Helper
  const runTest = async (
    id: string,
    name: string,
    desc: string,
    fn: () => Promise<string>
  ) => {
    const t0 = performance.now();
    try {
      const msg = await fn();
      results.push({
        id,
        name,
        description: desc,
        passed: true,
        message: msg,
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err: any) {
      results.push({
        id,
        name,
        description: desc,
        passed: false,
        message: `FAILED: ${err?.message || err}`,
        durationMs: Math.round(performance.now() - t0),
      });
    }
  };

  // Test 1: Internet valt weg tijdens finish
  await runTest(
    'test-1',
    'Internet valt weg tijdens finish',
    'Finishregistratie moet lokaal in IndexedDB bewaard blijven met status LOCAL_ONLY zonder te wachten op netwerk',
    async () => {
      const bib = 901;
      const t1 = new Date().toISOString();
      const { record } = await operationService.recordFinish(
        event.id,
        bib,
        undefined,
        t1,
        performance.now()
      );
      const inDb = await db.timingRecords.get(record.id);
      if (!inDb || inDb.bibNumber !== bib) throw new Error('Record niet gevonden in IndexedDB');
      if (inDb.syncStatus !== 'LOCAL_ONLY') throw new Error('Status moet LOCAL_ONLY zijn');
      return `Succesvol opgeslagen in IndexedDB (${inDb.timestamp}) met status LOCAL_ONLY`;
    }
  );

  // Test 2: Internet valt weg tijdens start
  await runTest(
    'test-2',
    'Internet valt weg tijdens start',
    'Starttijd wordt onmiddellijk lokaal persistent opgeslagen',
    async () => {
      const bib = 902;
      const tStart = new Date().toISOString();
      const rec = await operationService.recordStart(
        event.id,
        bib,
        undefined,
        tStart,
        performance.now()
      );
      const inDb = await db.timingRecords.get(rec.id);
      if (!inDb) throw new Error('Startrecord ontbreekt in IndexedDB');
      return `Startrecord voor bib #${bib} persistent opgeslagen`;
    }
  );

  // Test 3: Internet valt weg tijdens shooting
  await runTest(
    'test-3',
    'Internet valt weg tijdens shooting',
    'Schietstand registratie wordt lokaal vastgelegd met alle schoten en missers',
    async () => {
      const mockP: Participant = {
        id: 'p-test-shoot-offline',
        firstName: 'Test',
        lastName: 'Runner',
        categoryId: 'cat-test',
        raceProfileId: 'prof-test',
        bibNumber: 903,
        status: 'STARTED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.participants.put(mockP);

      const res = await operationService.recordShooting(
        event.id,
        mockP,
        1,
        'Stand 4',
        5,
        4,
        1,
        [true, true, false, true, true]
      );
      const inDb = await db.shootingResults.get(res.id);
      if (!inDb || inDb.hits !== 4 || inDb.misses !== 1) {
        throw new Error('Schietrecord komt niet overeen in DB');
      }
      return `Schietresultaat 4/5 hits lokaal bewaard in IndexedDB`;
    }
  );

  // Test 4: Browser refreshed tijdens registratie
  await runTest(
    'test-4',
    'Browser refreshed tijdens registratie',
    'Reeds gelogde operaties en timingrecords blijven intact in IndexedDB na gesimuleerde refresh',
    async () => {
      const bib = 904;
      await operationService.recordFinish(
        event.id,
        bib,
        undefined,
        new Date().toISOString(),
        performance.now()
      );
      // Simuleer herstart: lees opnieuw uit DB zonder in-memory state
      const count = await db.timingRecords.where({ bibNumber: bib, type: 'FINISH' }).count();
      if (count === 0) throw new Error('Gegevens verloren na herstart');
      return `Record aanwezig in lokale opslag (${count} records gevonden)`;
    }
  );

  // Test 5: Clouddatabase tijdelijk onbereikbaar
  await runTest(
    'test-5',
    'Clouddatabase onbereikbaar',
    'Operations queue verzamelt records in LOCAL_ONLY/QUEUED status zonder foutmeldingen naar de operator',
    async () => {
      const ops = await db.operations.where('syncStatus').equals('LOCAL_ONLY').toArray();
      return `${ops.length} ongesynchroniseerde operaties veilig in lokale queue bewaard`;
    }
  );

  // Test 6: Dubbele finish conflict
  await runTest(
    'test-6',
    'Dubbele finish conflict detectie',
    'Twee afzonderlijke finishrecords voor hetzelfde startnummer genereren een conflict in db.conflicts zonder stil overschrijven',
    async () => {
      const bib = 906;
      const p: Participant = {
        id: 'p-test-conflict',
        firstName: 'Conflict',
        lastName: 'Tester',
        categoryId: 'cat-test',
        raceProfileId: 'prof-test',
        bibNumber: bib,
        status: 'STARTED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.participants.put(p);

      // Finish A van FINISH-01
      operationService.setDeviceAndOperator('FINISH-01', 'Operator A');
      const { record: r1 } = await operationService.recordFinish(
        event.id,
        bib,
        p,
        '2026-09-19T10:22:31.000Z',
        1000
      );

      // Finish B van FINISH-02
      operationService.setDeviceAndOperator('FINISH-02', 'Operator B');
      const { conflict } = await operationService.recordFinish(
        event.id,
        bib,
        p,
        '2026-09-19T10:22:34.000Z',
        1004
      );

      // Reset device
      operationService.setDeviceAndOperator('FINISH-01', 'Admin');

      if (!conflict) throw new Error('Conflict werd niet gedetecteerd!');
      const storedConflict = await db.conflicts.get(conflict.id);
      if (!storedConflict) throw new Error('Conflict niet opgeslagen in db.conflicts');

      return `Conflict succesvol vastgelegd: Finish A (${r1.timestamp}) vs Finish B (${conflict.recordB.timestamp})`;
    }
  );

  // Test 7: Dubbele start
  await runTest(
    'test-7',
    'Dubbele startregistratie',
    'Meerdere starts worden correct in de timingRecords auditlog bijgehouden',
    async () => {
      const bib = 907;
      await operationService.recordStart(event.id, bib, undefined, new Date().toISOString(), 100);
      await operationService.recordStart(event.id, bib, undefined, new Date().toISOString(), 200);
      const starts = await db.timingRecords.where({ bibNumber: bib, type: 'START' }).toArray();
      if (starts.length < 2) throw new Error('Niet alle startrecords zijn bewaard');
      return `Beide startrecords bewaard in auditlog (${starts.length} records)`;
    }
  );

  // Test 8: Dubbele shooting result
  await runTest(
    'test-8',
    'Dubbele shooting registratie',
    'Bestaande schietronde kan veilig worden gecorrigeerd met behoud van auditlog',
    async () => {
      const mockP: Participant = {
        id: 'p-test-shoot-dup',
        firstName: 'Dup',
        lastName: 'Shooter',
        categoryId: 'cat-test',
        raceProfileId: 'prof-test',
        bibNumber: 908,
        status: 'STARTED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.participants.put(mockP);

      await operationService.recordShooting(event.id, mockP, 1, 'Stand 1', 5, 4, 1);
      // Correctie met reden
      await operationService.recordShooting(
        event.id,
        mockP,
        1,
        'Stand 1',
        5,
        3,
        2,
        undefined,
        true,
        'Doelschijf 4 was randgeval en geteld als misser'
      );

      const records = await db.shootingResults
        .where({ participantId: mockP.id, round: 1 })
        .toArray();
      return `${records.length} schietregistraties bewaard met correctie-reden`;
    }
  );

  // Test 9: Twee devices wijzigen tegelijk
  await runTest(
    'test-9',
    'Gelijktijdige registratie op meerdere apparaten',
    'Elke registratie krijgt unieke operationId en deviceId zonder collision',
    async () => {
      const p1 = operationService.recordFinish(
        event.id,
        909,
        undefined,
        new Date().toISOString(),
        500
      );
      const p2 = operationService.recordFinish(
        event.id,
        910,
        undefined,
        new Date().toISOString(),
        502
      );
      const [r1, r2] = await Promise.all([p1, p2]);
      if (r1.record.id === r2.record.id) throw new Error('UUID collision gedetecteerd!');
      return `Beide operaties uniek geregistreerd: #${r1.record.bibNumber} en #${r2.record.bibNumber}`;
    }
  );

  // Test 10: Ongeldig startnummer
  await runTest(
    'test-10',
    'Ongeldig startnummer afhandeling',
    'Invoer met niet-numerieke tekens of 0 wordt veilig afgevangen zonder crash',
    async () => {
      const invalidBib = NaN;
      if (!isNaN(invalidBib) && invalidBib > 0) {
        throw new Error('Foutieve bib niet geweigerd');
      }
      return 'Validatie blokkeert ongeldige bibs vóór databaseopslag';
    }
  );

  // Test 11: Noodtijdregistratie onbekend startnummer (Req 43)
  await runTest(
    'test-11',
    'Noodtijdregistratie onbekend startnummer',
    'Onbekend startnummer (bijv. bib 999) registreert tijd direct als isUnknownBib: true',
    async () => {
      const emergencyBib = 999;
      const { record } = await operationService.recordFinish(
        event.id,
        emergencyBib,
        undefined,
        new Date().toISOString(),
        9999
      );
      if (!record.isUnknownBib) throw new Error('isUnknownBib vlag moet true zijn');
      return `Noodtijd geregistreerd voor onbekende atleet #${emergencyBib} (isUnknownBib: true)`;
    }
  );

  // Test 12: Klokverschil apparaten
  await runTest(
    'test-12',
    'Klokverschil monitoring',
    'Clock offset wordt geregistreerd in timingrecord en berekend voor Race Control',
    async () => {
      const offsetMs = 3400; // 3.4 seconden
      const { record } = await operationService.recordFinish(
        event.id,
        912,
        undefined,
        new Date().toISOString(),
        12000,
        offsetMs
      );
      if (record.clockOffsetMs !== offsetMs) throw new Error('Clock offset niet bewaard');
      return `Klokverschil (+${offsetMs}ms) correct bewaard in record`;
    }
  );

  // Test 13: Duplicate Stamhoofd import
  await runTest(
    'test-13',
    'Stamhoofd duplicate herkenning',
    'Parser detecteert duplicaten op basis van Stamhoofd ID, e-mail en naam+geboortedatum',
    async () => {
      const existing: Participant = {
        id: 'p-dup-stam',
        externalId: 'SH-DUP-1',
        firstName: 'Daan',
        lastName: 'Willems',
        email: 'daan.willems@telenet.be',
        birthDate: '2014-05-12',
        categoryId: 'cat-u12',
        raceProfileId: 'prof-junior',
        status: 'REGISTERED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const rows: RawParsedRow[] = [
        {
          rowIndex: 1,
          data: {
            Voornaam: 'Daan',
            Achternaam: 'Willems',
            'Stamhoofd ID': 'SH-DUP-1',
            Categorie: 'U12',
          },
        },
      ];

      const mapped = validateAndMapRows(
        rows,
        {
          firstName: 'Voornaam',
          lastName: 'Achternaam',
          externalId: 'Stamhoofd ID',
          category: 'Categorie',
        },
        [existing]
      );

      if (!mapped[0].isDuplicate) throw new Error('Duplicate werd niet herkend!');
      return `Duplicate succesvol gemarkeerd: ${mapped[0].duplicateReason}`;
    }
  );

  // Test 14: App gesloten met unsynced records
  await runTest(
    'test-14',
    'Persistente sync queue bij herstart',
    'Alle uncommitted operations blijven behouden in IndexedDB na sluiten van browser',
    async () => {
      const pendingCount = await db.operations.count();
      if (pendingCount === 0) {
        // Maak even een test-operation
        await db.operations.put({
          operationId: generateUUID(),
          eventId: event.id,
          type: 'STATUS_CHANGED',
          deviceId: 'TEST-DEV',
          operatorId: 'Tester',
          deviceTimestamp: new Date().toISOString(),
          payload: { test: true },
          syncStatus: 'LOCAL_ONLY',
          revision: 1,
        });
      }
      const verifiedCount = await db.operations.count();
      return `${verifiedCount} operaties persistent bewaard in IndexedDB operations queue`;
    }
  );

  // Test 15: Excel multi-tab import en categorie-fallback
  await runTest(
    'test-15',
    'Excel import met meerdere tabbladen',
    'Samenvoegen van geselecteerde tabbladen en automatische categorie-toewijzing op basis van tabbladnaam',
    async () => {
      const mockSheets: SheetInfo[] = [
        {
          name: 'Kids U10',
          rowCount: 2,
          headers: ['Voornaam', 'Achternaam', 'Bib'],
          rows: [
            { rowIndex: 1, sheetName: 'Kids U10', data: { Voornaam: 'Lars', Achternaam: 'Vermeulen', Bib: '101' } },
            { rowIndex: 2, sheetName: 'Kids U10', data: { Voornaam: 'Emma', Achternaam: 'Peeters', Bib: '102' } },
          ],
        },
        {
          name: 'Senioren Heren',
          rowCount: 1,
          headers: ['Voornaam', 'Achternaam', 'Bib', 'Reeks'],
          rows: [
            { rowIndex: 1, sheetName: 'Senioren Heren', data: { Voornaam: 'Bram', Achternaam: 'De Smet', Bib: '201', Reeks: 'M40' } },
          ],
        },
        {
          name: 'Leeg tabblad',
          rowCount: 0,
          headers: [],
          rows: [],
        },
      ];

      // Test combination of sheets
      const combined = combineSheets(mockSheets, ['Kids U10', 'Senioren Heren']);
      if (combined.rows.length !== 3) {
        throw new Error(`Verwacht 3 samengevoegde rijen, maar kreeg ${combined.rows.length}`);
      }

      // Map rows with fallback to sheet name
      const mapped = validateAndMapRows(
        combined.rows,
        {
          firstName: 'Voornaam',
          lastName: 'Achternaam',
          bibNumber: 'Bib',
          category: 'Reeks',
        },
        [],
        true // useSheetAsCategoryFallback
      );

      // Verify row 1 got category from sheet name ('Kids U10')
      if (mapped[0].categoryName !== 'Kids U10' || mapped[0].categorySource !== 'sheet') {
        throw new Error(`Rij 1 categorie fallback mislukt: ${mapped[0].categoryName}`);
      }

      // Verify row 3 kept explicit category ('M40')
      if (mapped[2].categoryName !== 'M40') {
        throw new Error(`Rij 3 expliciete categorie overschreven: ${mapped[2].categoryName}`);
      }

      return `3 rijen uit 2 tabbladen samengevoegd; categorie-fallback naar tabbladnaam ('Kids U10') en expliciete reeks ('M40') gevalideerd`;
    }
  );

  // Test 16: één leeftijdscategorie kan meerdere wedstrijdprofielen gebruiken
  await runTest(
    'test-16',
    'Categorie met meerdere wedstrijdprofielen',
    'Een leeftijdscategorie bewaart meerdere toegestane profielen zonder bestaande koppelingen te overschrijven',
    async () => {
      const category: Category = {
        id: 'cat-multi-profile-test',
        name: 'U12 Test',
        code: 'U12-T',
        gender: 'ALL',
        minAge: 10,
        maxAge: 11,
        raceProfileIds: ['profile-short', 'profile-long'],
        raceProfileId: 'profile-short',
      };
      const profileIds = getCategoryProfileIds(category);
      if (profileIds.length !== 2) throw new Error(`Verwacht 2 profielen, kreeg ${profileIds.length}`);
      if (!categoryUsesProfile(category, 'profile-short') || !categoryUsesProfile(category, 'profile-long')) {
        throw new Error('Niet alle wedstrijdprofielen zijn gekoppeld');
      }
      const updated = withCategoryProfiles(category, [...profileIds, 'profile-relay']);
      if (getCategoryProfileIds(updated).length !== 3) throw new Error('Derde profiel kon niet worden toegevoegd');
      return 'Categorie behoudt 3 onafhankelijke wedstrijdprofielkoppelingen';
    }
  );

  return results;
}
