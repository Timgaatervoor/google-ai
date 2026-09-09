import 'fake-indexeddb/auto';
import Dexie, { liveQuery } from 'dexie';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BiathlonDatabase } from '../src/db/dexieDb';
import { SyncService } from '../src/services/syncService';
import { suppressSyncJournal, entityKey } from '../src/db/syncJournal';
import { generateUUID } from '../src/services/uuid';

const wave = { id: 'wave-test', eventId: 'event', name: 'Wave test - 13:20', scheduledStartTime: '13:20', waveNumber: 1, status: 'SCHEDULED', categoryIds: [], maxParticipants: 20 };
async function fixture(run: (context: { a: BiathlonDatabase; b: BiathlonDatabase; sa: SyncService; sb: SyncService; cloud: Map<string, any>; fail: (value: boolean) => void }) => Promise<void>) {
  const a = new BiathlonDatabase(`sync-a-${crypto.randomUUID()}`), b = new BiathlonDatabase(`sync-b-${crypto.randomUUID()}`);
  const sa = new SyncService(a), sb = new SyncService(b);
  for (const service of [sa, sb]) service.getConfig = () => ({ enabled: true, eventId: 'event', projectUrl: 'https://test.invalid', anonKey: 'test' });
  for (const database of [a, b]) await database.events.put({ id: 'event' } as any);
  const cloud = new Map<string, any>();
  const oldFetch = globalThis.fetch;
  let failing = false;
  globalThis.fetch = async (input, init) => {
    if (failing) throw new Error('Netwerk onderbroken');
    const url = new URL(String(input));
    if (init?.method === 'POST') {
      assert.match(String((init.headers as any).Prefer), /ignore-duplicates/);
      for (const row of JSON.parse(String(init.body))) if (!cloud.has(row.operation_id)) cloud.set(row.operation_id, row);
      return new Response(null, { status: 201 });
    }
    assert.equal(url.searchParams.get('event_id'), 'eq.event');
    const offset = Number(url.searchParams.get('offset'));
    return Response.json([...cloud.values()].filter(row => row.event_id === 'event').slice(offset, offset + 500));
  };
  try { await run({ a, b, sa, sb, cloud, fail: value => { failing = value; } }); }
  finally { globalThis.fetch = oldFetch; await a.delete(); await b.delete(); }
}
async function sync(service: SyncService) { const result = await service.syncNow(); assert.equal(result.error, undefined); }

test('two devices create, update, delete waves and replay without resurrection or echo', async () => fixture(async ({ a, b, sa, sb, cloud }) => {
  await a.waves.put(wave as any);
  assert.equal(await a.operations.count(), 1, 'write and queue committed together');
  await sync(sa); await sync(sb);
  assert.equal((await b.waves.get(wave.id))?.scheduledStartTime, '13:20');
  await b.waves.update(wave.id, { scheduledStartTime: '13:25' });
  await sync(sb); await sync(sa);
  assert.equal((await a.waves.get(wave.id))?.scheduledStartTime, '13:25');
  await a.waves.delete(wave.id); await sync(sa); await sync(sb);
  assert.equal(await b.waves.count(), 0);
  b.close(); await b.open();
  await sb.fullSync(); await sync(sa);
  assert.equal(await a.waves.count(), 0); assert.equal(await b.waves.count(), 0);
  assert.equal(cloud.size, 3, 'remote application does not queue echoes');
  assert.equal(await a.operations.count(), 3); assert.equal(await b.operations.count(), 3);
  assert.ok((await b.syncEntities.get(entityKey('event', 'waves', wave.id)))?.deletedAt);
}));

test('participants, bib/wave assignments, profiles, categories and removal are shared', async () => fixture(async ({ a, b, sa, sb }) => {
  await a.participants.put({ id: 'rune', firstName: 'Rune', bibNumber: 42, waveId: 'wave-test', status: 'READY', updatedAt: '2025-01-01' } as any);
  await a.raceProfiles.put({ id: 'profile', name: 'Short', legs: [] } as any);
  await a.categories.put({ id: 'cat', raceProfileIds: ['profile'] } as any);
  await sync(sa); await sync(sb);
  assert.equal((await b.participants.get('rune'))?.waveId, 'wave-test');
  assert.equal((await b.participants.get('rune'))?.bibNumber, 42);
  assert.equal((await b.raceProfiles.get('profile'))?.eventId, 'event');
  assert.deepEqual((await b.categories.get('cat'))?.raceProfileIds, ['profile']);
  await a.participants.update('rune', { waveId: undefined }); await sync(sa); await sync(sb);
  assert.equal((await b.participants.get('rune'))?.waveId, undefined);
  await a.participants.delete('rune'); await sync(sa); await sync(sb); await sb.fullSync();
  assert.equal(await b.participants.count(), 0);
}));

test('offline edits survive reopen and network failure until an acknowledged upload', async () => fixture(async ({ a, b, sa, sb, fail }) => {
  await a.waves.put(wave as any); await sync(sa); await sync(sb);
  sa.setSimulatedOffline(true);
  await a.waves.update(wave.id, { scheduledStartTime: '14:00' });
  assert.match((await sa.syncNow()).error!, /offline/);
  a.close(); await a.open();
  assert.equal(await sa.getPendingCount(), 1);
  sa.setSimulatedOffline(false); fail(true);
  assert.match((await sa.syncNow()).error!, /Netwerk/);
  assert.equal(await sa.getPendingCount(), 1);
  assert.equal((await a.waves.get(wave.id))?.scheduledStartTime, '14:00');
  fail(false); await sync(sa); await sync(sb);
  assert.equal((await b.waves.get(wave.id))?.scheduledStartTime, '14:00');
  assert.equal(await sa.getPendingCount(), 0);
}));

test('event mismatch, foreign cloud payload and an empty cloud never delete local data', async () => fixture(async ({ a, b, sa, sb, cloud }) => {
  await a.waves.put(wave as any); await sync(sa);
  cloud.clear(); await sync(sa);
  assert.equal(await a.waves.count(), 1);
  await sa.fullSync(); assert.equal(cloud.size, 1, 'full sync can refill an empty cloud');
  const existing = [...cloud.values()][0];
  cloud.set('foreign', { ...existing, operation_id: 'foreign', event_id: 'other' });
  await sync(sb); assert.equal(await b.waves.count(), 1);
  cloud.set('invalid', { ...existing, operation_id: 'invalid', payload: { ...existing.payload, record: { ...existing.payload.record, eventId: 'other' } } });
  assert.match((await sb.syncNow()).error!, /Ongeldige/);
  assert.equal(await b.operations.get('invalid'), undefined, 'invalid operation transaction rolls back');
  const good = sa.getConfig(); sa.getConfig = () => ({ ...good, eventId: 'other' });
  assert.match((await sa.syncNow()).error!, /huidige evenement/);
  assert.equal(await a.waves.count(), 1);
}));

test('concurrent config edits converge regardless of download order; delete beats stale offline edits', async () => fixture(async ({ a, b, sa, sb, cloud }) => {
  await a.waves.put(wave as any); await sync(sa); await sync(sb);
  await a.waves.update(wave.id, { scheduledStartTime: '14:00' });
  await b.waves.update(wave.id, { scheduledStartTime: '15:00' });
  await sync(sa); await sync(sb);
  const entries = [...cloud.entries()].reverse(); cloud.clear(); entries.forEach(([k,v]) => cloud.set(k,v));
  await sync(sa);
  assert.deepEqual(await a.waves.get(wave.id), await b.waves.get(wave.id));
  await a.waves.delete(wave.id);
  await b.waves.update(wave.id, { scheduledStartTime: '16:00' });
  await sync(sa); await sync(sb); await sync(sa);
  assert.equal(await a.waves.count(), 0); assert.equal(await b.waves.count(), 0);
}));

test('timing and shooting records from both devices survive; undo before original stays reversed', async () => fixture(async ({ a, b, sa, sb, cloud }) => {
  for (const [database, id] of [[a, 'a'], [b, 'b']] as const) {
    await database.timingRecords.put({ id, eventId: 'event', bibNumber: 12, type: 'FINISH', timestamp: `2026-09-08T13:20:0${id === 'a' ? 1 : 2}Z`, syncStatus: 'LOCAL_ONLY' } as any);
    await database.shootingResults.put({ id: `s-${id}`, eventId: 'event', participantId: 'p', bibNumber: 12, round: 1, hits: 4, misses: 1, syncStatus: 'LOCAL_ONLY' } as any);
  }
  await sync(sa); await sync(sb); await sync(sa);
  assert.equal(await a.timingRecords.count(), 2); assert.equal(await b.timingRecords.count(), 2);
  assert.equal(await a.shootingResults.count(), 2); assert.equal(await b.shootingResults.count(), 2);
  assert.equal(await a.conflicts.count(), 2);
  const original = [...cloud.values()].find(row => row.payload.table === 'timingRecords');
  cloud.set('undo-first', { ...original, operation_id: 'undo-first', type: 'RECORD_UNDO', payload: { recordId: 'later' } });
  cloud.set('later', { ...original, operation_id: 'later', payload: { ...original.payload, recordId: 'later', record: { ...original.payload.record, id: 'later' } } });
  await sync(sa); assert.equal((await a.timingRecords.get('later'))?.isReversed, true);
}));

test('bulk clear emits tombstones and failed outer transactions roll back the journal', async () => fixture(async ({ a, b, sa, sb }) => {
  await assert.rejects(a.transaction('rw', a.waves, async () => { await a.waves.put(wave as any); throw new Error('rollback'); }));
  assert.equal(await a.waves.count(), 0); assert.equal(await a.operations.count(), 0);
  await a.waves.bulkPut([wave, { ...wave, id: 'wave-2' }] as any); await sync(sa); await sync(sb);
  await a.waves.clear(); assert.equal(await sa.getPendingCount(), 2);
  await sync(sa); await sync(sb); assert.equal(await b.waves.count(), 0);
}));

test('legacy baseline uses existing timestamps and does not overwrite a newer cloud version', async () => fixture(async ({ a, b, sa, sb }) => {
  await a.waves.put(wave as any); await sync(sa);
  await b.transaction('rw', b.waves, () => { suppressSyncJournal(); return b.waves.put({ ...wave, scheduledStartTime: '10:00' } as any); });
  await sync(sb); await sync(sa);
  assert.equal((await b.waves.get(wave.id))?.scheduledStartTime, '13:20');
  assert.equal((await a.waves.get(wave.id))?.scheduledStartTime, '13:20');
}));

test('v3 to v4 migration retains legacy records and assigns ownership without fresh edits', async () => {
  const name = `legacy-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(3).stores({ events: 'id', participants: 'id', raceProfiles: 'id', categories: 'id', waves: 'id', timingRecords: 'id', shootingResults: 'id', operations: 'operationId' });
  await legacy.table('events').put({ id: 'event' });
  await legacy.table('participants').put({ id: 'p', updatedAt: '2020-01-01', bibNumber: 9 });
  await legacy.table('timingRecords').put({ id: 't', eventId: 'event' });
  legacy.close();
  const database = new BiathlonDatabase(name);
  try {
    await database.open();
    assert.equal((await database.participants.get('p'))?.eventId, 'event');
    assert.equal((await database.participants.get('p'))?.updatedAt, '2020-01-01');
    assert.equal(await database.timingRecords.count(), 1);
    assert.equal(await database.operations.count(), 0);
  } finally { await database.delete(); }
});

test('partial upload and lost acknowledgement retry idempotently without dropping the queue', async () => fixture(async ({ a, b, sa, sb, cloud }) => {
  await a.waves.bulkPut(Array.from({ length: 205 }, (_, i) => ({ ...wave, id: `batch-${i}` })) as any);
  const transport = globalThis.fetch;
  let batches = 0;
  globalThis.fetch = async (input, init) => {
    const response = await transport(input, init);
    if (init?.method === 'POST' && ++batches === 2) throw new Error('Acknowledgement verloren');
    return response;
  };
  assert.match((await sa.syncNow()).error!, /Acknowledgement/);
  assert.equal(cloud.size, 205, 'server received the second batch, client did not get its acknowledgement');
  assert.equal(await sa.getPendingCount(), 5);
  globalThis.fetch = transport;
  await sync(sa); await sync(sb);
  assert.equal(await sa.getPendingCount(), 0); assert.equal(await b.waves.count(), 205);
  assert.equal(cloud.size, 205);
}));

test('legacy timing cannot resurrect a deleted timing record and stale assignments stay detached', async () => fixture(async ({ a, b, sa, sb, cloud }) => {
  await a.waves.put(wave as any);
  await a.participants.put({ id: 'p', waveId: wave.id } as any);
  await a.timingRecords.put({ id: 't', eventId: 'event', bibNumber: 1, type: 'START' } as any);
  await sync(sa); await sync(sb);
  await a.waves.delete(wave.id); await a.timingRecords.delete('t');
  await b.participants.update('p', { waveId: wave.id, firstName: 'changed offline' });
  await sync(sa); await sync(sb); await sync(sa);
  assert.equal((await a.participants.get('p'))?.waveId, undefined);
  const row = [...cloud.values()][0];
  cloud.set('legacy-start', { ...row, operation_id: 'legacy-start', type: 'START_RECORDED', payload: { recordId: 't', bibNumber: 1 } });
  await sync(sa); assert.equal(await a.timingRecords.count(), 0);
}));

test('remote projection notifies Dexie liveQuery without a refresh', async () => fixture(async ({ a, b, sa, sb }) => {
  let resolve: () => void;
  const notified = new Promise<void>(done => { resolve = done; });
  const subscription = liveQuery(() => b.waves.toArray()).subscribe(rows => {
    if (rows.some(row => row.id === wave.id)) resolve();
  });
  let timeout: ReturnType<typeof setTimeout>;
  try {
    await a.waves.put(wave as any); await sync(sa); await sync(sb);
    await Promise.race([notified, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('No reactive update')), 2000); })]);
  } finally { clearTimeout(timeout); subscription.unsubscribe(); }
}));

test('deleting the last timing record restores participant status regardless of operation order', async () => fixture(async ({ a, b, sa, sb }) => {
  await a.participants.put({ id: 'p', status: 'FINISHED' } as any);
  await a.timingRecords.put({ id: 't', eventId: 'event', participantId: 'p', bibNumber: 1, type: 'FINISH' } as any);
  await sync(sa); await sync(sb);
  await a.participants.update('p', { status: 'READY' }); await sync(sa); await sync(sb);
  await a.timingRecords.delete('t'); await sync(sa); await sync(sb);
  assert.equal((await b.participants.get('p'))?.status, 'READY');
}));

test('v1 upgrade runs all historical migrations without losing category profile links', async () => {
  const name = `legacy-v1-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(1).stores({ events: 'id', participants: 'id', raceProfiles: 'id', categories: 'id', waves: 'id', timingRecords: 'id', shootingResults: 'id', operations: 'operationId' });
  await legacy.table('events').put({ id: 'event' });
  await legacy.table('categories').put({ id: 'cat', raceProfileId: 'profile' });
  legacy.close();
  const database = new BiathlonDatabase(name);
  try {
    await database.open();
    assert.deepEqual((await database.categories.get('cat'))?.raceProfileIds, ['profile']);
    assert.equal((await database.categories.get('cat'))?.eventId, 'event');
  } finally { await database.delete(); }
});

test('parallel local writes in one transaction converge to the same projection on the other device', async () => fixture(async ({ a, b, sa, sb }) => {
  await a.transaction('rw', a.waves, () => Promise.all([
    a.waves.put({ ...wave, scheduledStartTime: '14:00' } as any),
    a.waves.put({ ...wave, scheduledStartTime: '15:00' } as any),
  ]));
  await sync(sa); await sync(sb);
  assert.deepEqual(await a.waves.get(wave.id), await b.waves.get(wave.id));
}));

test('UUID fallback retains offline timing compatibility on non-secure LAN origins', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
  try { assert.match(generateUUID(), /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor); else Reflect.deleteProperty(globalThis, 'crypto'); }
});
