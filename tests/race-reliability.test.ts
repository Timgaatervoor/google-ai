import 'fake-indexeddb/auto';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { RaceClock } from '../src/services/raceClock';
import { effectiveShooting, shootingPenalty } from '../src/services/shootingRules';
import { calculateRaceResults } from '../src/services/timingEngine';
import { db } from '../src/db/dexieDb';
import { operationService } from '../src/services/operationService';
import { syncService } from '../src/services/syncService';
import { createDeviceInvite, readDeviceInvite, joinEvent } from '../src/services/devicePairing';
import type { Participant, RaceProfile, ShootingResult } from '../src/types';

after(async () => { assert.equal(db.name, 'BiathlonDeHaanDB-node-test'); await db.delete(); });
const p: Participant = { id: 'p', firstName: 'Test', lastName: 'Race', categoryId: 'cat', raceProfileId: 'profile', bibNumber: 1, waveId: 'wave', status: 'READY', createdAt: '', updatedAt: '' };
const profile: RaceProfile = { id: 'profile', name: 'Test', description: '', penaltySecondsPerMiss: 20, penaltyLapsPerMiss: 1, legs: [{ id: 's1', type: 'SHOOT', name: '1', shotCount: 5, penaltyType: 'time', penaltyValueSeconds: 10 }, { id: 's2', type: 'SHOOT', name: '2', shotCount: 5, penaltyType: 'time', penaltyValueSeconds: 30 }] };
const shot = (id: string, round: number, misses: number, patch = {}): ShootingResult => ({ id, eventId: 'event', participantId: 'p', bibNumber: 1, round, shots: 5, hits: 5 - misses, misses, timestamp: `2026-09-07T10:00:0${id.length}Z`, station: 'S', deviceId: 'D', operatorId: 'O', syncStatus: 'LOCAL_ONLY', ...patch });

test('pairing preserves checksums through jsonb, excludes PINs and backs up before replacing a device', async () => {
  const oldFetch = globalThis.fetch, oldConfig = syncService.getConfig, oldSave = syncService.saveConfig, oldCheck = syncService.checkClockOffset;
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { value: { href: 'https://race.example/#settings' }, configurable: true });
  let config = { enabled: true, projectUrl: 'https://example.supabase.co', anonKey: 'sb_publishable_test', eventId: 'pair-event' };
  syncService.getConfig = () => config;
  syncService.saveConfig = value => { config = value; };
  syncService.checkClockOffset = async () => 0;
  let envelope: any;
  globalThis.fetch = async (input, options) => {
    if (String(input).endsWith('race_create_pairing')) {
      const body = JSON.parse(String(options!.body));
      assert.match(body.p_code_hash, /^[a-f0-9]{64}$/);
      envelope = { serializedSnapshot: body.p_snapshot.serializedSnapshot, data: body.p_snapshot.data };
      return new Response(null, { status: 204 });
    }
    if (!envelope) return new Response('', { status: 400 });
    const result = envelope; envelope = undefined;
    return Response.json(result);
  };
  try {
    await db.events.put({ id: 'pair-event', name: 'Paired race' } as any);
    await db.devices.put({ id: 'admin', pin: '1234', role: 'ADMIN', isLocked: false } as any);
    const invite = await createDeviceInvite();
    const preview = await readDeviceInvite(invite.link);
    assert.deepEqual(preview.snapshot.data.devices, []);
    assert.deepEqual(preview.snapshot.data.auditLogs, []);
    assert.equal(preview.snapshot.data.syncConfig, undefined);
    await assert.rejects(readDeviceInvite(invite.link), /HTTP 400/);
    await joinEvent(preview, 'START_OPERATOR');
    const device = await db.devices.toCollection().first();
    assert.equal(device?.role, 'START_OPERATOR');
    assert.equal(device?.isLocked, true);
    assert.notEqual(device?.id, 'admin');
    assert.equal(await db.snapshots.count() > 0, true);
    assert.equal(config.eventId, 'pair-event');
    assert.equal(config.enabled, true);
    await assert.rejects(readDeviceInvite('https://evil.example/#join=' + btoa(JSON.stringify({ projectUrl: 'https://evil.example', anonKey: 'test', code: 'a'.repeat(32) }))), /HTTPS/);
  } finally {
    await db.events.clear(); await db.devices.clear();
    globalThis.fetch = oldFetch; syncService.getConfig = oldConfig; syncService.saveConfig = oldSave; syncService.checkClockOffset = oldCheck;
    if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation); else delete (globalThis as any).location;
  }
});

test('central clock compensates device offset using lowest RTT and survives Windows clock changes and offline holdover', async () => {
  const base = Date.parse('2026-09-07T10:00:00Z');
  let mono = 0, wall = base - 5000;
  const clock = new RaceClock(() => wall, () => mono);
  const delays = [200, 20, 100, 60, 150];
  let i = 0;
  await clock.synchronize('server', async () => { const delay = delays[i++]; mono += delay; wall += delay; return base + mono - delay / 2; });
  assert.equal(clock.status().offsetMs, 5000);
  assert.equal(clock.status().uncertaintyMs! < 12, true);
  const before = clock.nowMs();
  wall += 3600000; mono += 1000;
  assert.equal(clock.nowMs() - before, 1000);
  await clock.synchronize('server', async () => { throw new Error('offline'); });
  assert.equal(clock.status().error, 'offline');
  mono += 360000;
  assert.equal(clock.status().state, 'STALE');
  clock.reset('other-server');
  assert.equal(clock.status().state, 'UNSYNCED');
});

test('failed initial clock calibration never reports a successful synchronization', async () => {
  const clock = new RaceClock();
  await clock.synchronize('server', async () => NaN);
  assert.equal(clock.status().state, 'UNSYNCED');
  assert.equal(clock.status().syncedAt, undefined);
});

test('corrections replace old shooting rounds and per-leg penalty rules are used', () => {
  const original = shot('old', 1, 3);
  const correction = shot('new', 1, 1, { isCorrection: true, supersedesIds: ['old'] });
  const records = [original, correction, shot('second', 2, 1)];
  assert.deepEqual(effectiveShooting(records).effective.map(s => s.id).sort(), ['new', 'second']);
  const times = [{ id: 'start', bibNumber: 1, type: 'START', timestamp: '2026-09-07T10:00:00Z' }, { id: 'finish', bibNumber: 1, type: 'FINISH', timestamp: '2026-09-07T10:01:00Z' }] as any;
  const result = calculateRaceResults([{ ...p, status: 'FINISHED' }], times, records, [], [], [profile])[0];
  assert.equal(result.penaltySeconds, 40);
  assert.equal(result.officialTimeMs, 100000);
  assert.equal(result.rankOverall, 1);
  const incomplete = calculateRaceResults([{ ...p, status: 'FINISHED' }], times, [correction], [], [], [profile])[0];
  assert.equal(incomplete.rankOverall, undefined);
  assert.equal(incomplete.isPendingShooting, true);
  const concurrent = shot('other-correction', 1, 0, { isCorrection: true, supersedesIds: ['old'] });
  assert.equal(effectiveShooting([...records, concurrent]).issues.has('p'), true);
  assert.deepEqual(shootingPenalty({ ...profile, legs: [{ ...profile.legs[0], penaltyType: 'lap', penaltyLapsPerMiss: 2 }] }, 1, 3), { seconds: 0, laps: 6 });
  assert.equal(shootingPenalty({ ...profile, legs: [{ ...profile.legs[0], penaltyType: 'none' }] }, 1, 3).seconds, 0);
});

test('wave start writes an outgoing start operation for every participant and is atomic and locked', async () => {
  await db.events.put({ id: 'event' } as any);
  await db.participants.put(p);
  await db.waves.put({ id: 'wave', eventId: 'event', status: 'SCHEDULED' } as any);
  await operationService.recordMassWaveStart('event', 'wave', 1, [p], '2026-09-07T10:00:00Z');
  assert.equal((await db.operations.toArray()).filter(o => o.type === 'START_RECORDED').length, 1);
  assert.equal((await db.participants.get('p'))?.status, 'STARTED');
  await assert.rejects(operationService.recordMassWaveStart('event', 'wave', 1, [p], '2026-09-07T10:01:00Z'), /gestart/);
  await db.events.update('event', { officialResultsLocked: true });
  await assert.rejects(operationService.recordFinish('event', 1, p, '2026-09-07T10:10:00Z', 0), /vergrendeld/);
  assert.equal((await db.timingRecords.toArray()).filter(t => t.type === 'FINISH').length, 0);
  await db.events.update('event', { officialResultsLocked: false });
  await operationService.recordShooting('event', p, 1, 'S', 5, 2, 3);
  await assert.rejects(operationService.recordShooting('event', p, 1, 'S', 5, 3, 2), /correctie/);
  await operationService.recordShooting('event', p, 1, 'S', 5, 4, 1, undefined, true, 'jury');
  assert.equal(effectiveShooting(await db.shootingResults.toArray()).effective[0].misses, 1);
});

test('sync reads beyond 1000 operations and applies revocation before original record without losing it', async () => {
  await db.operations.clear(); await db.timingRecords.clear(); await db.shootingResults.clear();
  const getConfig = syncService.getConfig, oldFetch = globalThis.fetch;
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
  syncService.getConfig = () => ({ enabled: true, projectUrl: 'https://test.invalid', anonKey: 'test', eventId: 'event' });
  const rows = Array.from({ length: 1203 }, (_, i) => ({ operation_id: `remote-${i}`, event_id: 'event', type: 'PARTICIPANT_CREATED', device_id: 'remote', operator_id: 'op', device_timestamp: '2026-09-07T10:00:00Z', payload: {} as any }));
  rows[0] = { ...rows[0], type: 'RECORD_UNDO', payload: { recordId: 'revoked' } };
  rows[1202] = { ...rows[1202], type: 'START_RECORDED', payload: { recordId: 'revoked', bibNumber: 8, timestamp: '2026-09-07T10:00:00Z' } };
  const offsets: number[] = [];
  globalThis.fetch = async (input, init) => { if (init?.method === 'POST') return new Response(null, { status: 201 }); const offset = Number(new URL(String(input)).searchParams.get('offset') || 0); offsets.push(offset); return Response.json(rows.slice(offset, offset + 500)); };
  try {
    const result = await syncService.syncNow();
    assert.equal(result.error, undefined);
    assert.equal(await db.operations.filter(op => op.operationId.startsWith('remote-')).count(), 1203);
    assert.deepEqual(offsets, [0, 500, 1000]);
    assert.equal((await db.timingRecords.get('revoked'))?.isReversed, true);
    globalThis.fetch = async () => new Response('', { status: 403 });
    assert.match((await syncService.syncNow()).error!, /HTTP 403/);
  } finally { syncService.getConfig = getConfig; globalThis.fetch = oldFetch; if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete (globalThis as any).navigator; }
});
