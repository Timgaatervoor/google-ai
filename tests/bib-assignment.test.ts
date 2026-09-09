import 'fake-indexeddb/auto';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Participant } from '../src/types';
import { db } from '../src/db/dexieDb';
import { planAgeBibs, updateBibs } from '../src/services/bibAssignment';

const person = (id: string, birthDate?: string, bibNumber?: number): Participant => ({ id, birthDate, bibNumber, firstName: id, lastName: id, categoryId: '', raceProfileId: '', createdAt: '', updatedAt: '', status: 'REGISTERED' });
const ranges = [{ minAge: 10, maxAge: 11, firstBib: 1, lastBib: 10 }, { minAge: 35, maxAge: 50, firstBib: 100, lastBib: 110 }];
after(async () => { assert.equal(db.name, 'BiathlonDeHaanDB-node-test'); await db.delete(); });

test('age ranges use December 31, sort names and skip occupied numbers and missing birthdays', () => {
  const people = [person('Z', '2015-12-31'), person('A', '2016-01-01'), person('Master', '11/10/1989'), person('Outside', '2000-01-01', 1), person('Unknown'), person('Existing', '2015-01-01', 3)];
  const plan = planAgeBibs(people, '2026-09-07', ranges, true);
  assert.deepEqual(plan.map(p => [p.participantId, p.bibNumber]), [['A', 2], ['Z', 4], ['Master', 100]]);
  assert.equal(plan[1].age, 11);
  assert.equal(planAgeBibs(people, '2026-09-07', ranges, false).find(p => p.participantId === 'Existing'), undefined); // already number 3
});

test('invalid and overlapping ranges and exhausted number ranges fail before writing', () => {
  assert.throws(() => planAgeBibs([], '', ranges, true), /evenementdatum/);
  assert.throws(() => planAgeBibs([], '2026-09-07', [{ ...ranges[0], minAge: NaN }], true), /controleer/);
  assert.throws(() => planAgeBibs([], '2026-09-07', [ranges[0], { ...ranges[1], minAge: 11 }], true), /Leeftijdsbereiken/);
  assert.throws(() => planAgeBibs([], '2026-09-07', [ranges[0], { ...ranges[1], firstBib: 10 }], true), /Borstnummerbereiken/);
  assert.throws(() => planAgeBibs([person('A', '2015-01-01'), person('B', '2015-01-01')], '2026-09-07', [{ ...ranges[0], lastBib: 1 }], true), /Niet genoeg/);
});

test('bulk assignment validates fresh preview; clear keeps participants and source data; race records block both actions', async () => {
  await db.events.put({ id: 'event', date: '2026-09-07', status: 'PREPARATION' } as any);
  await db.participants.bulkPut([person('A', '2015-01-01'), { ...person('B', '1989-01-01', 99), stamhoofdTicketSecret: 'test-ticket', notes: 'behouden' }]);
  const preview = planAgeBibs(await db.participants.toArray(), '2026-09-07', ranges, true);
  await db.participants.update('A', { bibNumber: 5 });
  await assert.rejects(updateBibs({ clear: false, ranges, onlyMissing: true, preview }), /nieuwe preview/);
  assert.equal((await db.participants.get('A'))?.bibNumber, 5);
  assert.equal(await updateBibs({ clear: true }), 2);
  assert.equal(await db.participants.count(), 2);
  assert.equal((await db.participants.get('B'))?.bibNumber, undefined);
  assert.equal((await db.participants.get('B'))?.stamhoofdTicketSecret, 'test-ticket');
  assert.equal((await db.participants.get('B'))?.notes, 'behouden');
  const next = planAgeBibs(await db.participants.toArray(), '2026-09-07', ranges, true);
  assert.equal(await updateBibs({ clear: false, ranges, onlyMissing: true, preview: next }), 2);
  assert.equal((await db.participants.get('A'))?.bibNumber, 1);
  assert.equal((await db.participants.get('B'))?.bibNumber, 100);
  await db.timingRecords.put({ id: 'finish', bibNumber: 1, type: 'FINISH' } as any);
  await assert.rejects(updateBibs({ clear: true }), /wedstrijdregistraties|individuele borstnummercorrectie/);
  await assert.rejects(updateBibs({ clear: false, ranges, onlyMissing: true, preview: [] }), /individuele borstnummercorrectie/);
  assert.equal((await db.participants.get('A'))?.bibNumber, 1);
  assert.equal(await db.timingRecords.count(), 1);
});
