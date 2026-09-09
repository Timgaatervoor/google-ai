import type { BiathlonDatabase } from '../db/dexieDb';
import { entityKey, entityOperation, suppressSyncJournal, syncedTables, versionFor, type SyncedTable } from '../db/syncJournal';
import type { RaceOperation } from '../types';

/** Backfill once, atomically, without assigning a fresh edit time to old snapshots. */
export async function seedSyncJournal(database: BiathlonDatabase, eventId: string) {
  await database.transaction('rw', [...syncedTables.map(t => database.table(t)), database.events, database.operations, database.syncEntities], async () => {
    suppressSyncJournal();
    const events = await database.events.toArray();
    if (events.length !== 1 || events[0].id !== eventId) throw new Error('Synchronisatie vereist één actief lokaal evenement.');
    for (const name of syncedTables) for (const record of await database.table(name).toArray()) {
      if (record.eventId && record.eventId !== eventId) continue;
      if (await database.syncEntities.get(entityKey(eventId, name, record.id))) continue;
      const op = entityOperation(name, record, eventId, false, true);
      await database.operations.add(op);
      await database.syncEntities.put(versionFor(op));
      await database.table(name).put(op.payload.record);
    }
  });
}

/** Caller owns the encompassing transaction and stores operation + projection together. */
export async function applyEntityOperation(database: BiathlonDatabase, op: RaceOperation) {
  const { table: name, recordId, record } = op.payload;
  if (!syncedTables.includes(name) || typeof recordId !== 'string' || !recordId ||
      !record || record.id !== recordId || record.eventId !== op.eventId || !Number.isFinite(Date.parse(op.deviceTimestamp))) {
    throw new Error('Ongeldige entity-operation; download gestopt zonder data te wissen.');
  }
  const table = database.table(name);
  const current = await table.get(recordId);
  if (current?.eventId && current.eventId !== op.eventId) throw new Error('Record-id bestaat in een ander evenement.');
  const previous = await database.syncEntities.get(entityKey(op.eventId, name, recordId));
  const deleting = op.type === 'ENTITY_DELETED';
  // A deleted identity is never reused. Re-creation requires a new UUID.
  if (previous?.deletedAt && !deleting) return;
  if (!deleting && previous && (Date.parse(previous.updatedAt) > Date.parse(op.deviceTimestamp) ||
      (Date.parse(previous.updatedAt) === Date.parse(op.deviceTimestamp) && previous.operationId >= op.operationId))) {
    console.info('[SYNC] Conflict: lokale versie behouden', name, recordId);
    return;
  }
  if (deleting) {
    await table.delete(recordId);
    if (name === 'timingRecords' || name === 'shootingResults') await database.conflicts
      .filter(c => c.eventId === op.eventId && (c.recordA.id === recordId || c.recordB.id === recordId))
      .modify({ resolvedWinner: 'MANUAL', resolvedAt: op.deviceTimestamp, resolvedReason: 'Registratie gewist' });
    if (name === 'waves') await database.participants.where('waveId').equals(recordId)
      .filter(p => !p.eventId || p.eventId === op.eventId).modify({ waveId: undefined });
  }
  else {
    const merged = { ...record, ...(name === 'timingRecords' || name === 'shootingResults' ? { syncStatus: 'SYNCED' } : {}) };
    if (name === 'participants' && merged.waveId &&
        (await database.syncEntities.get(entityKey(op.eventId, 'waves', merged.waveId)))?.deletedAt) delete merged.waveId;
    if ((name === 'timingRecords' || name === 'shootingResults') && merged.participantId) {
      const participant = await database.participants.get(merged.participantId);
      if (participant?.eventId === op.eventId && participant.bibNumber) merged.bibNumber = participant.bibNumber;
    }
    if (name === 'timingRecords') {
      const revoked = await database.operations.filter(other => other.eventId === op.eventId &&
        ((other.type === 'RECORD_UNDO' && other.payload.recordId === recordId) ||
         (other.type === 'CONFLICT_RESOLVED' && other.payload.discardedRecordId === recordId))).count();
      if (current?.isReversed || revoked) { merged.isReversed = true; merged.reversedReason ||= current?.reversedReason || 'Gesynchroniseerde correctie'; }
    }
    await table.put(merged);
    if (name === 'participants' && merged.bibNumber) {
      await database.timingRecords.where('participantId').equals(recordId).filter(t => t.eventId === op.eventId).modify({ bibNumber: merged.bibNumber });
      await database.shootingResults.where('participantId').equals(recordId).filter(t => t.eventId === op.eventId).modify({ bibNumber: merged.bibNumber });
    }
    if ((name === 'timingRecords' && !merged.isReversed) || name === 'shootingResults') {
      const others = await table.filter(other => other.eventId === op.eventId && other.id !== recordId &&
        (name === 'timingRecords' ? !other.isReversed && other.bibNumber === merged.bibNumber && other.type === merged.type
          : other.participantId === merged.participantId && other.round === merged.round &&
            !merged.supersedesIds?.includes(other.id) && !other.supersedesIds?.includes(recordId))).toArray();
      for (const other of others) await database.conflicts.put({ id: `conflict-${[other.id, recordId].sort().join('-')}`,
        eventId: op.eventId, participantId: merged.participantId || '', bibNumber: merged.bibNumber,
        type: name === 'shootingResults' ? 'SHOOTING_CONFLICT' : merged.type === 'START' ? 'START_CONFLICT' : 'FINISH_CONFLICT',
        recordA: other, recordB: merged, createdAt: op.deviceTimestamp });
    }
  }
  await database.syncEntities.put(versionFor(op));
  console.info('[SYNC] Download', name, recordId, deleting ? 'deleted' : 'updated');
}

export async function acceptLegacyPatch(database: BiathlonDatabase, op: RaceOperation, table: SyncedTable, id: string) {
  const previous = await database.syncEntities.get(entityKey(op.eventId, table, id));
  const record = await database.table(table).get(id);
  if (!record || (record.eventId && record.eventId !== op.eventId) || previous?.deletedAt) return false;
  if (previous && (Date.parse(previous.updatedAt) > Date.parse(op.deviceTimestamp) ||
      (Date.parse(previous.updatedAt) === Date.parse(op.deviceTimestamp) && previous.operationId >= op.operationId))) return false;
  await database.syncEntities.put({ key: entityKey(op.eventId, table, id), eventId: op.eventId, table,
    recordId: id, updatedAt: op.deviceTimestamp, operationId: op.operationId });
  return true;
}
