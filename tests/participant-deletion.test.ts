import 'fake-indexeddb/auto';
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db/dexieDb';
import { deleteParticipantData } from '../src/services/participantDeletion';

beforeEach(async () => {
  await db.delete(); await db.open();
  await db.events.put({ id: 'event' } as any);
  await db.participants.put({ id: 'p', eventId: 'event', bibNumber: 1, status: 'FINISHED' } as any);
  await db.timingRecords.bulkPut([
    { id: 'start', eventId: 'event', participantId: 'p', bibNumber: 1, type: 'START' },
    { id: 'finish', eventId: 'event', participantId: 'p', bibNumber: 1, type: 'FINISH' },
    { id: 'foreign', eventId: 'other', participantId: 'p', bibNumber: 1, type: 'FINISH' },
    { id: 'different-person', eventId: 'event', participantId: 'other-p', bibNumber: 1, type: 'FINISH' },
  ] as any);
  await db.shootingResults.bulkPut([
    { id: 'old', eventId: 'event', participantId: 'p', bibNumber: 1, round: 1 },
    { id: 'correction', eventId: 'event', participantId: 'p', bibNumber: 1, round: 1, supersedesIds: ['old'] },
    { id: 'round2', eventId: 'event', participantId: 'p', bibNumber: 1, round: 2 },
  ] as any);
});
after(() => db.delete());

test('delete finish/start independently, recalculate status and queue durable tombstones', async () => {
  await deleteParticipantData('event', 'p', 'finish', 'Verkeerd geklikt');
  assert.equal(await db.timingRecords.get('finish'), undefined);
  assert.ok(await db.timingRecords.get('start'));
  assert.equal((await db.participants.get('p'))?.status, 'STARTED');
  await deleteParticipantData('event', 'p', 'start', '');
  assert.equal((await db.participants.get('p'))?.status, 'READY');
  assert.equal(await db.shootingResults.count(), 3);
  assert.equal(await db.operations.filter(op => op.type === 'ENTITY_DELETED' && op.syncStatus === 'LOCAL_ONLY').count(), 2);
  assert.equal(await db.auditLogs.count(), 2);
});

test('clearing a shooting round also deletes old corrections without touching other rounds', async () => {
  await deleteParticipantData('event', 'p', 'shooting', '', 1);
  assert.deepEqual((await db.shootingResults.toArray()).map(record => record.id), ['round2']);
  assert.ok(await db.timingRecords.get('finish'));
  await deleteParticipantData('event', 'p', 'shooting', '');
  assert.equal(await db.shootingResults.count(), 0);
});

test('delete participant cascades own records only and resolves associated conflicts', async () => {
  await db.conflicts.put({ id: 'conflict', eventId: 'event', recordA: { id: 'finish' }, recordB: { id: 'different-person' } } as any);
  await deleteParticipantData('event', 'p', 'participant', 'Dubbel');
  assert.equal(await db.participants.count(), 0);
  assert.deepEqual((await db.timingRecords.toArray()).map(record => record.id).sort(), ['different-person', 'foreign']);
  assert.equal(await db.shootingResults.count(), 0);
  assert.equal((await db.conflicts.get('conflict'))?.resolvedWinner, 'MANUAL');
  assert.equal(await db.operations.filter(op => op.type === 'ENTITY_DELETED').count(), 6);
});

test('locked results and wrong event reject deletion without changing records or the queue', async () => {
  await db.events.update('event', { officialResultsLocked: true });
  const operations = await db.operations.count();
  await assert.rejects(deleteParticipantData('event', 'p', 'participant', ''), /vergrendeld/);
  await assert.rejects(deleteParticipantData('other', 'p', 'participant', ''), /evenement/);
  assert.ok(await db.participants.get('p'));
  assert.equal(await db.timingRecords.count(), 4);
  assert.equal(await db.operations.count(), operations);
});
