import Dexie, { type Table } from 'dexie';
import { installSyncJournal, suppressSyncJournal, type EntityVersion } from './syncJournal';
import type { StamhoofdConfig } from '../types/stamhoofd';
import type {
  RaceEvent,
  RaceProfile,
  Category,
  Wave,
  Participant,
  TimingRecord,
  ShootingResult,
  RaceOperation,
  RaceConflict,
  AuditLog,
  EventSnapshot,
  DeviceConfig,
} from '../types';

export class BiathlonDatabase extends Dexie {
  syncEntities!: Table<EntityVersion, string>;
  stamhoofdConfigs!: Table<StamhoofdConfig, string>;
  events!: Table<RaceEvent, string>;
  raceProfiles!: Table<RaceProfile, string>;
  categories!: Table<Category, string>;
  waves!: Table<Wave, string>;
  participants!: Table<Participant, string>;
  timingRecords!: Table<TimingRecord, string>;
  shootingResults!: Table<ShootingResult, string>;
  operations!: Table<RaceOperation, string>;
  conflicts!: Table<RaceConflict, string>;
  auditLogs!: Table<AuditLog, string>;
  snapshots!: Table<EventSnapshot, string>;
  devices!: Table<DeviceConfig, string>;

  constructor(name = 'BiathlonDeHaanDB') {
    super(name);

    this.version(1).stores({
      events: 'id, status, isTestMode',
      raceProfiles: 'id, name',
      categories: 'id, code, raceProfileId',
      waves: 'id, eventId, waveNumber, status',
      participants: 'id, externalId, bibNumber, waveId, categoryId, status, [categoryId+status]',
      timingRecords: 'id, eventId, participantId, bibNumber, type, timestamp, syncStatus, [bibNumber+type]',
      shootingResults: 'id, eventId, participantId, bibNumber, round, [participantId+round], syncStatus',
      operations: 'operationId, eventId, participantId, type, syncStatus, deviceTimestamp',
      conflicts: 'id, eventId, participantId, resolvedWinner',
      auditLogs: 'id, timestamp, action, participantId, bibNumber',
      snapshots: 'snapshotId, eventId, timestamp',
      devices: 'id, role',
    });

    this.version(2)
      .stores({
        events: 'id, status, isTestMode',
        raceProfiles: 'id, name',
        categories: 'id, code, raceProfileId, *raceProfileIds',
        waves: 'id, eventId, waveNumber, status',
        participants: 'id, externalId, bibNumber, waveId, categoryId, status, [categoryId+status]',
        timingRecords: 'id, eventId, participantId, bibNumber, type, timestamp, syncStatus, [bibNumber+type]',
        shootingResults: 'id, eventId, participantId, bibNumber, round, [participantId+round], syncStatus',
        operations: 'operationId, eventId, participantId, type, syncStatus, deviceTimestamp',
        conflicts: 'id, eventId, participantId, resolvedWinner',
        auditLogs: 'id, timestamp, action, participantId, bibNumber',
        snapshots: 'snapshotId, eventId, timestamp',
        devices: 'id, role',
      })
      .upgrade(async (transaction) => {
        await transaction.table<Category>('categories').toCollection().modify((category) => {
          const legacyProfileId = category.raceProfileId;
          const existingIds = Array.isArray(category.raceProfileIds) ? category.raceProfileIds : [];
          category.raceProfileIds = [...new Set([...existingIds, ...(legacyProfileId ? [legacyProfileId] : [])])];
          category.raceProfileId = category.raceProfileIds[0];
        });
      });
    this.version(3).stores({
      participants: 'id, externalId, bibNumber, waveId, categoryId, status, [categoryId+status], stamhoofdItemId, stamhoofdTicketSecret, [stamhoofdEventId+stamhoofdWebshopId]',
      stamhoofdConfigs: 'id',
    });
    this.version(4).stores({
      syncEntities: 'key, eventId, table, recordId',
      participants: 'id, eventId, externalId, bibNumber, waveId, categoryId, status, [categoryId+status], stamhoofdItemId, stamhoofdTicketSecret, [stamhoofdEventId+stamhoofdWebshopId]',
      raceProfiles: 'id, eventId, name',
      categories: 'id, eventId, code, raceProfileId, *raceProfileIds',
    }).upgrade(async tx => {
      suppressSyncJournal();
      const events = await tx.table('events').toArray();
      if (events.length === 1) for (const name of ['participants', 'raceProfiles', 'categories']) {
        await tx.table(name).toCollection().modify(record => { record.eventId ??= events[0].id; });
      }
    });
    installSyncJournal(this);
  }
}

// Node has no browser IndexedDB. Keep test/CLI storage explicitly separate.
export const db = new BiathlonDatabase(typeof window === 'undefined' ? 'BiathlonDeHaanDB-node-test' : 'BiathlonDeHaanDB');

export async function getActiveEventId(): Promise<string> {
  const event = await db.events.toCollection().first();
  if (!event) throw new Error('Maak eerst een evenement aan.');
  return event.id;
}
