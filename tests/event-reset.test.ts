import 'fake-indexeddb/auto';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, getActiveEventId } from '../src/db/dexieDb';
import { resetToBlankEvent, initializeEmptyEvent } from '../src/services/sampleDataService';
import { syncService, type SyncConfig } from '../src/services/syncService';

after(async () => {
  assert.equal(db.name, 'BiathlonDeHaanDB-node-test');
  await db.delete();
});

test('first use starts empty and generic, and initialization preserves an existing organization', async () => {
  await initializeEmptyEvent();
  const event = await db.events.toCollection().first();
  assert.equal(event.name, 'Nieuw evenement');
  assert.equal(event.date, '');
  assert.equal(event.location, '');
  assert.equal(event.organizer, '');
  assert.equal(event.isTestMode, false);
  assert.equal(await db.participants.count(), 0);
  await db.events.update(event.id, { name: 'Eigen wedstrijd', organizer: 'Eigen organisatie' });
  await initializeEmptyEvent();
  assert.equal(await db.events.count(), 1);
  assert.equal((await db.events.get(event.id)).organizer, 'Eigen organisatie');
  await db.events.clear();
});

test('a completely new event has empty logs and race data, a fresh ID and disabled cloud sync', async () => {
  const getConfig = syncService.getConfig;
  const saveConfig = syncService.saveConfig;
  let config: SyncConfig = { enabled: true, projectUrl: 'https://example.invalid', anonKey: 'test-placeholder', eventId: 'old-event' };
  syncService.getConfig = () => config;
  syncService.saveConfig = next => { config = next; };
  try {
    await db.events.put({ id: 'old-event' } as any);
    for (const table of [db.auditLogs, db.participants, db.waves, db.timingRecords, db.shootingResults, db.conflicts, db.categories, db.raceProfiles, db.stamhoofdConfigs]) await table.put({ id: 'old-data' } as any);
    await db.operations.put({ operationId: 'old-operation', syncStatus: 'LOCAL_ONLY', eventId: 'old-event' } as any);
    await db.snapshots.put({ snapshotId: 'saved-backup', eventId: 'old-event' } as any);
    await resetToBlankEvent('Nieuwe wedstrijd', '2027-09-19', 'De Haan');
    const event = await db.events.toCollection().first();
    assert.notEqual(event.id, 'old-event');
    assert.notEqual(event.id, 'event-de-haan-2026');
    assert.equal(event.id, await getActiveEventId());
    assert.equal(event.name, 'Nieuwe wedstrijd');
    for (const table of [db.auditLogs, db.operations, db.participants, db.waves, db.timingRecords, db.shootingResults, db.conflicts, db.categories, db.raceProfiles, db.stamhoofdConfigs]) assert.equal(await table.count(), 0, table.name);
    assert.equal(await db.events.count(), 1);
    assert.equal(await db.snapshots.count(), 1, 'Existing backups remain available');
    assert.deepEqual(config, { enabled: false, projectUrl: 'https://example.invalid', anonKey: 'test-placeholder', eventId: event.id });
    await resetToBlankEvent('Nog een wedstrijd', '2028-09-19', 'De Haan');
    assert.notEqual(await getActiveEventId(), event.id);
    assert.equal(await db.auditLogs.count(), 0);
  } finally { syncService.getConfig = getConfig; syncService.saveConfig = saveConfig; }
});

test('an in-flight Supabase response cannot restore old operations after a complete reset', async () => {
  const getConfig = syncService.getConfig;
  const saveConfig = syncService.saveConfig;
  const originalFetch = globalThis.fetch;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
  let config: SyncConfig = { enabled: true, projectUrl: 'https://example.invalid', anonKey: 'test-placeholder', eventId: await getActiveEventId() };
  syncService.getConfig = () => config;
  syncService.saveConfig = next => { config = next; };
  const oldEventId = config.eventId;
  let startRequest: () => void;
  const started = new Promise<void>(resolve => { startRequest = resolve; });
  let releaseResponse: (response: Response) => void;
  const delayed = new Promise<Response>(resolve => { releaseResponse = resolve; });
  const calls: string[] = [];
  globalThis.fetch = async (_url, init) => { calls.push(init?.method ?? 'GET'); startRequest(); return delayed; };
  try {
    // No pending upload: exercise a download that returns after an event reset.
    const inFlight = syncService.syncNow();
    await started;
    await resetToBlankEvent('Nieuwe race tijdens sync', '2029-09-19', 'De Haan');
    releaseResponse(Response.json([{ operation_id: 'remote-old', event_id: oldEventId, type: 'FINISH_RECORDED', device_id: 'old-device', operator_id: 'old-operator', device_timestamp: '2026-09-19T12:00:00Z', payload: { recordId: 'remote-finish', bibNumber: 125 } }]));
    await inFlight;
    assert.equal(await db.operations.count(), 0);
    assert.equal(await db.timingRecords.count(), 0);
    assert.equal(await db.auditLogs.count(), 0);
    assert.deepEqual(calls, ['GET'], 'No uploads or remote deletions during reset');
    config = { ...config, enabled: true, eventId: oldEventId };
    const mismatch = await syncService.syncNow();
    assert.match(mismatch.error, /huidige evenement/);
    assert.deepEqual(calls, ['GET']);
  } finally {
    syncService.getConfig = getConfig; syncService.saveConfig = saveConfig; globalThis.fetch = originalFetch;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});
