import 'fake-indexeddb/auto';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { buildEventWorkbook, readEventWorkbook, planEventWorkbook, currentWorkbookData, applyEventWorkbook, type WorkbookData } from '../src/services/eventWorkbook';
import { db } from '../src/db/dexieDb';

const data: WorkbookData = {
  event: { id: 'excel-event', name: 'Testwedstrijd', date: '2026-09-19', location: '', organizer: '', status: 'DRAFT' } as any,
  profiles: [{ id: 'long', name: '9 km masters', description: '', articles: ['Lange afstand'], penaltySecondsPerMiss: 20, penaltyLapsPerMiss: 1, legs: [{ id: 'run', name: 'Lopen', type: 'RUN', distanceMeters: 9000 }, { id: 'shot', name: 'Schieten', type: 'SHOOT', shotCount: 7 }, { id: 'finish', name: 'Finish', type: 'FINISH' }] }, { id: 'short', name: '4 km jeugd', description: '', articles: ['Korte afstand'], penaltySecondsPerMiss: 10, penaltyLapsPerMiss: 1, legs: [{ id: 'run2', name: 'Lopen', type: 'RUN', distanceMeters: 4000 }, { id: 'finish2', name: 'Finish', type: 'FINISH' }] }],
  categories: [{ id: 'masters', code: 'masters', name: 'Masters', gender: 'ALL', minAge: 35, maxAge: 99, raceProfileIds: ['long'] }, { id: 'u12', code: 'u12', name: 'U12', gender: 'ALL', minAge: 10, maxAge: 11, raceProfileIds: ['short'] }],
  waves: [],
  participants: [
    { id: 'adult', firstName: 'Adult', lastName: 'Test', birthDate: '1989-10-11', article: 'Lange afstand', gender: 'M', categoryId: 'masters', raceProfileId: 'long', categoryAssignment: 'automatic', profileAssignment: 'automatic', status: 'READY', createdAt: '2026-09-01T10:00:00Z', updatedAt: '', phone: '003201234567', bibNumber: 1 },
    { id: 'child', firstName: 'Child', lastName: 'Test', birthDate: '2015-01-07', article: 'Korte afstand', gender: 'F', categoryId: 'u12', raceProfileId: 'short', categoryAssignment: 'automatic', profileAssignment: 'automatic', status: 'READY', createdAt: '2026-09-01T10:01:00Z', updatedAt: '', bibNumber: 2 },
  ],
};
const serialized = (book: XLSX.WorkBook) => readEventWorkbook(XLSX.write(book, { type: 'array', bookType: 'xlsx' }));
after(async () => { assert.equal(db.name, 'BiathlonDeHaanDB-node-test'); await db.delete(); });

test('blank Excel is empty; filled workbook survives XLSX serialization and follows article plus December 31 age', () => {
  const blank = serialized(buildEventWorkbook(data, true));
  assert.equal(XLSX.utils.sheet_to_json(blank.Sheets.Deelnemers).length, 0);
  assert.equal(XLSX.utils.sheet_to_json(blank.Sheets.Profielen).length, 0);
  const book = serialized(buildEventWorkbook(data));
  const plan = planEventWorkbook(book, { ...data, profiles: [], categories: [], participants: [] });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.warnings, []);
  assert.deepEqual(plan.data.participants.map(p => [p.categoryId, p.raceProfileId]), [['masters', 'long'], ['u12', 'short']]);
  assert.equal(plan.data.participants[0].phone, '003201234567');
  assert.equal(plan.data.profiles[0].legs[1].shotCount, 7);
  assert.match(book.Sheets.Deelnemers.S2.f!, /Evenement/);
  assert.equal(book.Sheets.Deelnemers.S2.v, 37);
});

test('Excel validates unknown references, duplicate bibs, malformed dates and header changes before import', () => {
  const book = buildEventWorkbook(data);
  book.Sheets.Deelnemers.G3 = { t: 'n', v: 1 };
  book.Sheets.Deelnemers.D2 = { t: 's', v: '2026-02-31' };
  book.Sheets.Categorieen.F2 = { t: 's', v: 'missing' };
  let plan = planEventWorkbook(book, data);
  assert.match(plan.errors.join(' '), /Dubbele borstnummers/);
  assert.match(plan.errors.join(' '), /geboortedatum/);
  assert.match(plan.errors.join(' '), /onbekende profielcode/);
  book.Sheets.Deelnemers.A1 = { t: 's', v: 'Wrong' };
  assert.match(planEventWorkbook(book, data).errors.join(' '), /kolomnamen/);
});

test('Excel reimport updates by stable ID, preserves source and race safeguards, and retains a restore backup', async () => {
  await db.events.put(data.event);
  await db.raceProfiles.bulkPut(data.profiles); await db.categories.bulkPut(data.categories);
  await db.participants.bulkPut(data.participants.map(p => ({ ...p, stamhoofdTicketSecret: 'source-ticket' })));
  const initial = await currentWorkbookData();
  const book = buildEventWorkbook(initial);
  book.Sheets.Deelnemers.B2 = { t: 's', v: 'Edited' };
  await applyEventWorkbook(book, JSON.stringify(initial));
  assert.equal(await db.participants.count(), 2);
  assert.equal((await db.participants.get('adult')).firstName, 'Edited');
  assert.equal((await db.participants.get('adult')).stamhoofdTicketSecret, 'source-ticket');
  assert.equal(await db.snapshots.count() > 0, true);
  await assert.rejects(applyEventWorkbook(book, JSON.stringify(initial)), /gewijzigd/);
  await db.timingRecords.put({ id: 'race-start' } as any);
  await assert.rejects(applyEventWorkbook(book, JSON.stringify(await currentWorkbookData())), /voor de wedstrijd/);
  assert.equal(await db.timingRecords.count(), 1);
});
