import 'fake-indexeddb/auto';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { competitionAge, classifyParticipant } from '../src/services/participantClassification';
import { applyClassification } from '../src/services/applyClassification';
import { calculateRaceResults } from '../src/services/timingEngine';
import { db } from '../src/db/dexieDb';
import { applySync, defaultFields } from '../src/services/stamhoofdSync';
import type { StamhoofdConfig, StamhoofdSnapshot } from '../src/types/stamhoofd';
import type { Category, Participant, RaceProfile, TimingRecord } from '../src/types';

const profiles: RaceProfile[] = [
  { id: 'long', name: '9 km masters', articles: ['Lange afstand'], description: '', legs: [], penaltySecondsPerMiss: 20, penaltyLapsPerMiss: 0 },
  { id: 'short', name: '4 KM jeugd', articles: ['Korte afstand'], description: '', legs: [], penaltySecondsPerMiss: 20, penaltyLapsPerMiss: 0 },
];
const categories: Category[] = [
  { id: 'masters', name: 'Masters', code: 'MAS', gender: 'ALL', minAge: 35, raceProfileIds: ['long'] },
  { id: 'u12', name: 'U12', code: 'U12', gender: 'ALL', minAge: 10, maxAge: 11, raceProfileIds: ['short'] },
];
const person = (patch: Partial<Participant> = {}): Participant => ({ id: 'person', firstName: 'Test', lastName: 'Deelnemer', birthDate: '07/01/2015', article: 'Korte afstand', categoryId: '', raceProfileId: '', status: 'REGISTERED', createdAt: '', updatedAt: '', ...patch });

after(async () => { assert.equal(db.name, 'BiathlonDeHaanDB-node-test'); await db.delete(); });

test('December 31 age uses event year, validates dates and handles Dutch and ISO dates', () => {
  assert.equal(competitionAge('11/10/1989', '2026-09-07'), 37);
  assert.equal(competitionAge('2015-12-31', '2026-01-01'), 11);
  assert.equal(competitionAge('07/01/2015', '2027-01-01'), 12);
  assert.equal(competitionAge('31/02/2015', '2026-09-07'), undefined);
  assert.equal(competitionAge('2027-01-01', '2026-09-07'), undefined);
  assert.equal(competitionAge(undefined, '2026-09-07'), undefined);
});

test('article AND category match the two requested examples; neither default nor first match wins', () => {
  const youth = classifyParticipant(person(), '2026-09-07', categories, profiles);
  assert.deepEqual([youth.categoryId, youth.raceProfileId, youth.issues], ['u12', 'short', []]);
  const master = classifyParticipant(person({ birthDate: '11/10/1989', article: 'Lange afstand' }), '2026-09-07', categories, profiles);
  assert.deepEqual([master.categoryId, master.raceProfileId], ['masters', 'long']);
  assert.equal(classifyParticipant(person({ article: 'Lange afstand' }), '2026-09-07', categories, profiles).raceProfileId, '');
  const overlapCategories = [...categories, { ...categories[1], id: 'duplicate', raceProfileIds: ['short', 'other'] }];
  assert.equal(classifyParticipant(person(), '2026-09-07', overlapCategories, profiles).categoryId, '');
  const overlapProfiles = [...profiles, { ...profiles[1], id: 'other' }];
  assert.equal(classifyParticipant(person(), '2026-09-07', [{ ...categories[1], raceProfileIds: ['short', 'other'] }], overlapProfiles).raceProfileId, '');
});

test('gender-specific categories need known gender; manual category survives automated assignment', () => {
  const genderCategories = [{ ...categories[0], gender: 'M' as const }];
  const p = person({ birthDate: '1989-10-11', article: 'Lange afstand' });
  assert.equal(classifyParticipant(p, '2026-09-07', genderCategories, profiles).categoryId, '');
  assert.equal(classifyParticipant({ ...p, gender: 'M' }, '2026-09-07', genderCategories, profiles).categoryId, 'masters');
  assert.equal(classifyParticipant({ ...p, categoryId: 'masters', categoryAssignment: 'manual' }, '2026-09-07', genderCategories, profiles).raceProfileId, 'long');
});

test('apply saved rules after import, preserve manual choices and live participants, report missing matches', async () => {
  await db.events.put({ id: 'event', date: '2026-09-07' } as any);
  await db.raceProfiles.bulkPut(profiles);
  await db.categories.bulkPut(categories);
  await db.participants.bulkPut([
    person({ stamhoofdItemId: 'item' }),
    person({ id: 'manual', stamhoofdItemId: 'manual', categoryId: 'masters', raceProfileId: 'long', categoryAssignment: 'manual', profileAssignment: 'manual' }),
    person({ id: 'started', stamhoofdItemId: 'started', status: 'STARTED', raceProfileId: 'long' }),
    person({ id: 'timed', stamhoofdItemId: 'timed', bibNumber: 42, raceProfileId: 'long' }),
    person({ id: 'missing', stamhoofdItemId: 'missing', article: 'Unknown' }),
    person({ id: 'local' }),
  ]);
  await db.timingRecords.put({ id: 'existing-start', participantId: 'timed', bibNumber: 42, type: 'START' } as TimingRecord);
  const report = await applyClassification();
  assert.equal((await db.participants.get('person'))?.raceProfileId, 'short');
  assert.equal((await db.participants.get('manual'))?.raceProfileId, 'long');
  assert.equal((await db.participants.get('started'))?.raceProfileId, 'long');
  assert.equal((await db.participants.get('timed'))?.raceProfileId, 'long');
  assert.equal((await db.participants.get('local'))?.categoryId, '');
  assert.equal(report.problems.length, 1);
  assert.equal((await applyClassification()).updated, 0);
  await db.events.update('event', { officialResultsLocked: true });
  await assert.rejects(applyClassification(), /vergrendeld/);
  await db.events.update('event', { officialResultsLocked: false });
});

test('ranking and winner gap are per course; category rankings never mix short and long', () => {
  const people = [
    person({ id: 'a', bibNumber: 1, status: 'FINISHED', raceProfileId: 'short', categoryId: 'u12' }),
    person({ id: 'b', bibNumber: 2, status: 'FINISHED', raceProfileId: 'long', categoryId: 'u12' }),
    person({ id: 'c', bibNumber: 3, status: 'FINISHED', raceProfileId: 'short', categoryId: 'masters' }),
    person({ id: 'd', bibNumber: 4, status: 'FINISHED', raceProfileId: 'short', categoryId: 'u12' }),
    person({ id: 'unassigned', bibNumber: 5, status: 'FINISHED', categoryId: 'u12' }),
  ];
  const times = people.flatMap((p, i) => [
    { id: `start-${p.id}`, bibNumber: p.bibNumber, type: 'START', timestamp: '2026-09-07T10:00:00Z', isConfirmed: true },
    { id: `finish-${p.id}`, bibNumber: p.bibNumber, type: 'FINISH', timestamp: `2026-09-07T10:0${i + 1}:00Z`, isConfirmed: true },
  ]) as TimingRecord[];
  const results = calculateRaceResults(people, times, [], categories, [], profiles);
  const get = (id: string) => results.find(r => r.participantId === id)!;
  assert.equal(get('a').rankOverall, 1);
  assert.equal(get('b').rankOverall, 1);
  assert.equal(get('b').rankCategory, 1);
  assert.equal(get('b').gapMs, 0);
  assert.equal(get('c').rankOverall, 2);
  assert.equal(get('c').rankCategory, 1);
  assert.equal(get('d').rankOverall, 3);
  assert.equal(get('d').rankCategory, 2);
  assert.equal(get('unassigned').rankOverall, undefined);
});

test('API import retains article, assigns configured matches and permits unresolved imports', async () => {
  const shop = { id: 'shop', organizationId: 'org', name: 'Test', domain: 'example.be' };
  const config: StamhoofdConfig = { id: 'api-event', shop, domain: shop.domain, workerUrl: 'direct', fields: defaultFields.filter(f => f !== 'product'), mapping: {}, productCategories: { ticket: 'wrong-legacy-category' } };
  await db.events.put({ id: config.id, date: '2026-09-07' } as any);
  await db.categories.bulkPut(categories);
  await db.raceProfiles.bulkPut(profiles);
  const snapshot: StamhoofdSnapshot = { shop, webshop: {}, fetchedAt: '', tickets: [], orders: [{ id: 'order', status: 'Created', data: { cart: { items: [
    { id: 'api-item', product: { id: 'ticket', type: 'Ticket', name: 'Korte afstand' }, fieldAnswers: [
      { field: { name: 'Voornaam' }, answer: 'Api' }, { field: { name: 'Achternaam' }, answer: 'Test' },
      { field: { name: 'Geboortedatum' }, answer: '07/01/2015' }, { field: { name: 'Geslacht' }, answer: 'Vrouw' },
    ] },
    { id: 'unmatched-item', product: { id: 'other', type: 'Ticket', name: 'Nieuw artikel' }, fieldAnswers: [
      { field: { name: 'Voornaam' }, answer: 'Geen' }, { field: { name: 'Achternaam' }, answer: 'Indeling' },
    ] },
  ] } } }] };
  await applySync(snapshot, config, ['api-item', 'unmatched-item']);
  const people = (await db.participants.toArray()).filter(p => p.stamhoofdEventId === config.id);
  assert.equal(people.length, 2);
  const assigned = people.find(p => p.stamhoofdItemId === 'api-item')!;
  assert.deepEqual([assigned.article, assigned.gender, assigned.categoryId, assigned.raceProfileId], ['Korte afstand', 'F', 'u12', 'short']);
  assert.equal(people.find(p => p.stamhoofdItemId === 'unmatched-item')?.raceProfileId, '');
  await db.participants.update(assigned.id, { categoryId: 'masters', raceProfileId: 'long', categoryAssignment: 'manual', profileAssignment: 'manual' });
  await applySync(snapshot, config, ['api-item']);
  assert.equal((await db.participants.get(assigned.id))?.raceProfileId, 'long');
});
