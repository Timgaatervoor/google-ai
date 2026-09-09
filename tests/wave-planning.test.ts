import 'fake-indexeddb/auto';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Participant, Wave } from '../src/types';
import { db } from '../src/db/dexieDb';
import { applyWavePlan, defaultWaveSettings, nextWaveTime, planWaves, validateWaveSettings } from '../src/services/wavePlanning';

const settings = { ...defaultWaveSettings, capacity: 2 };
const person = (id: string, patch: Partial<Participant> = {}): Participant => ({ id, firstName: id, lastName: 'Test', createdAt: '2026-09-07T08:00:00Z', updatedAt: '', categoryId: 'u12', raceProfileId: 'short', article: 'Korte afstand', status: 'REGISTERED', ...patch });
const wave = (patch: Partial<Wave> = {}): Wave => ({ id: 'wave', eventId: 'event', name: 'Wave 1', waveNumber: 1, scheduledStartTime: '10:00:00', categoryIds: [], maxParticipants: 2, status: 'SCHEDULED', ...patch });
after(async () => { assert.equal(db.name, 'BiathlonDeHaanDB-node-test'); await db.delete(); });

test('wave defaults append at the interval, with validation and no midnight wrap', () => {
  assert.equal(nextWaveTime([], settings), '10:00:00');
  assert.equal(nextWaveTime([wave()], settings), '10:10:00');
  assert.equal(nextWaveTime([wave({ scheduledStartTime: '10:55:30' })], settings), '11:05:30');
  assert.throws(() => nextWaveTime([wave({ scheduledStartTime: '23:55:00' })], settings), /middernacht/);
  assert.throws(() => validateWaveSettings({ ...settings, capacity: 0 }), /capaciteit/);
  assert.throws(() => validateWaveSettings({ ...settings, intervalMinutes: -1 }), /interval/);
});

test('fill available capacity by original registration date and preserve assigned and inactive participants', () => {
  const people = [person('assigned', { waveId: 'wave' }), person('later', { stamhoofdRegisteredAt: '2026-09-03T09:00:00Z' }), person('first', { stamhoofdRegisteredAt: '2026-09-01T09:00:00Z' }), person('inactive', { stamhoofdInactive: true }), person('started', { status: 'STARTED' })];
  const plan = planWaves('event', [wave()], people, settings, 'registration');
  assert.deepEqual(plan.assignments.map(a => [a.participantId, a.waveId]), [['first', 'wave'], ['later', 'planned-2']]);
  assert.equal(plan.created[0].scheduledStartTime, '10:10:00');
  assert.equal(plan.created[0].maxParticipants, 2);
  assert.equal(plan.fallbackDates, 0);
});

test('grouping keeps articles or profiles apart and respects category restrictions and started waves', () => {
  const people = [person('short'), person('long', { article: 'Lange afstand', raceProfileId: 'long' }), person('missing', { article: '', raceProfileId: '' })];
  for (const grouping of ['article', 'profile'] as const) {
    const plan = planWaves('event', [wave({ status: 'STARTED' })], people, settings, grouping);
    assert.equal(plan.created.length, 2);
    assert.notEqual(plan.assignments[0].waveId, plan.assignments[1].waveId);
    assert.equal(plan.skipped.length, 1);
    assert.equal(plan.created[0].assignmentGroup?.type, grouping);
  }
  assert.equal(planWaves('event', [wave({ categoryIds: ['masters'] })], [person('youth')], settings, 'registration').created.length, 1);
});

test('transactional wave assignment rejects stale previews and is repeatable without duplicate assignments', async () => {
  await db.events.put({ id: 'event', status: 'PREPARATION' } as any);
  await db.waves.put(wave());
  await db.participants.bulkPut([person('a'), person('b'), person('c')]);
  const preview = planWaves('event', await db.waves.toArray(), await db.participants.toArray(), settings, 'registration');
  await db.waves.update('wave', { maxParticipants: 1 });
  await assert.rejects(applyWavePlan(settings, 'registration', preview), /nieuwe preview/);
  assert.equal((await db.participants.get('a'))?.waveId, undefined);
  const next = planWaves('event', await db.waves.toArray(), await db.participants.toArray(), settings, 'registration');
  assert.equal(await applyWavePlan(settings, 'registration', next), 3);
  assert.equal(await db.waves.count(), 2);
  assert.deepEqual((await db.events.get('event'))?.waveSettings, settings);
  const final = planWaves('event', await db.waves.toArray(), await db.participants.toArray(), settings, 'registration');
  assert.equal(final.assignments.length, 0);
  assert.equal(final.created.length, 0);
  await db.participants.put(person('recorded', { bibNumber: 17 }));
  await db.timingRecords.put({ id: 'finish', bibNumber: 17 } as any);
  const recorded = planWaves('event', await db.waves.toArray(), await db.participants.toArray(), settings, 'registration');
  await assert.rejects(applyWavePlan(settings, 'registration', recorded), /wedstrijdregistraties/);
  assert.equal((await db.participants.get('recorded'))?.waveId, undefined);
});
