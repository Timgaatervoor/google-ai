import Dexie, { type DBCore, type DBCoreTransaction } from 'dexie';
import type { RaceOperation } from '../types';
import { generateUUID } from '../services/uuid';

export const syncedTables = ['waves', 'participants', 'raceProfiles', 'categories', 'timingRecords', 'shootingResults'] as const;
export type SyncedTable = typeof syncedTables[number];
export interface EntityVersion {
  key: string;
  eventId: string;
  table: SyncedTable;
  recordId: string;
  updatedAt: string;
  operationId: string;
  deletedAt?: string;
}
export const entityKey = (eventId: string, table: string, id: string) => JSON.stringify([eventId, table, id]);
const suppressed = new WeakSet<DBCoreTransaction>();
const transactionTimes = new WeakMap<DBCoreTransaction, number>();
/** Suppression belongs to this transaction only; concurrent local edits still queue. */
export function suppressSyncJournal() {
  if (!Dexie.currentTransaction) throw new Error('Sync suppression requires a transaction');
  suppressed.add(Dexie.currentTransaction.idbtrans);
}
let fallbackDeviceId: string;
export function getSyncDeviceId(): string {
  if (typeof localStorage === 'undefined') return fallbackDeviceId ??= generateUUID();
  let id = localStorage.getItem('biathlon_sync_device_id');
  if (!id) { id = generateUUID(); localStorage.setItem('biathlon_sync_device_id', id); }
  return id;
}
export function entityOperation(table: SyncedTable, record: any, eventId: string, deleted = false, baseline = false, previous?: EntityVersion, localFloor = 0): RaceOperation {
  const now = new Date(Math.max(Date.now(), (Date.parse(previous?.updatedAt || '') || 0) + 1, localFloor + 1)).toISOString();
  const updatedAt = baseline ? (record.updatedAt || record.createdAt || '1970-01-01T00:00:00.000Z') : now;
  return {
    operationId: generateUUID(), eventId, type: deleted ? 'ENTITY_DELETED' : 'ENTITY_UPSERT',
    deviceId: getSyncDeviceId(), operatorId: 'Sync journal', deviceTimestamp: updatedAt,
    payload: { table, recordId: record.id, record: { ...record, eventId, createdAt: record.createdAt || updatedAt, updatedAt, updatedByDeviceId: getSyncDeviceId(), ...(deleted ? { deletedAt: updatedAt } : {}) } },
    revision: 1, syncStatus: 'LOCAL_ONLY',
  };
}
export function versionFor(op: RaceOperation): EntityVersion {
  return { key: entityKey(op.eventId, op.payload.table, op.payload.recordId), eventId: op.eventId,
    table: op.payload.table, recordId: op.payload.recordId, updatedAt: op.deviceTimestamp,
    operationId: op.operationId, ...(op.type === 'ENTITY_DELETED' ? { deletedAt: op.deviceTimestamp } : {}) };
}
export function installSyncJournal(database: Dexie) {
  database.use({ stack: 'dbcore', name: 'race-sync-journal', create(core: DBCore): DBCore {
    if (!core.schema.tables.some(table => table.name === 'syncEntities')) return core;
    return { ...core,
      transaction(stores, mode, options) {
        return core.transaction(mode === 'readwrite' && stores.some(s => syncedTables.includes(s as SyncedTable))
          ? [...new Set([...stores, 'events', 'operations', 'syncEntities'])] : stores, mode, options);
      },
      table(name) {
        const table = core.table(name);
        if (!syncedTables.includes(name as SyncedTable)) return table;
        return { ...table, async mutate(req) {
          if (suppressed.has(req.trans)) return table.mutate(req);
          const events = await core.table('events').query({ trans: req.trans, values: true, query: { index: core.table('events').schema.primaryKey, range: { type: 3, lower: undefined, upper: undefined } } });
          // Never guess ownership when a legacy database contains several events.
          const eventId = events.result.length === 1 ? events.result[0].id : undefined;
          const deleting = req.type === 'delete' || req.type === 'deleteRange';
          const records = req.type === 'deleteRange'
            ? (await table.query({ trans: req.trans, values: true, query: { index: table.schema.primaryKey, range: req.range } })).result
            : req.type === 'delete' ? await table.getMany({ trans: req.trans, keys: req.keys }) : req.values;
          const result = await table.mutate(req);
          try {
            for (let i = 0; i < records.length; i++) {
              const record = records[i];
              if (!record || result.failures[i]) continue;
              const owner = record.eventId || eventId;
              if (!owner) continue;
              const state = core.table('syncEntities');
              const previous = await state.get({ trans: req.trans, key: entityKey(owner, name, record.id) });
              if (previous?.deletedAt && !deleting) throw new Error('Dit record is verwijderd. Maak een nieuw record met een nieuw id.');
              const op = entityOperation(name as SyncedTable, record, owner, deleting, false, previous, transactionTimes.get(req.trans));
              transactionTimes.set(req.trans, Date.parse(op.deviceTimestamp));
              if (!deleting) {
                const stored = await table.mutate({ type: 'put', trans: req.trans, values: [op.payload.record] });
                if (stored.numFailures) throw new Error('Syncmetadata kon niet worden opgeslagen.');
              }
              const operations = await core.table('operations').mutate({ type: 'add', trans: req.trans, values: [op] });
              const versions = await state.mutate({ type: 'put', trans: req.trans, values: [versionFor(op)] });
              if (operations.numFailures || versions.numFailures) throw new Error('Lokale syncqueue kon niet worden opgeslagen.');
            }
          } catch (error) { req.trans.abort(); throw error; }
          return result;
        } };
      },
    };
  } });
}
