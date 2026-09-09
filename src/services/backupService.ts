import { db } from '../db/dexieDb';
import { suppressSyncJournal } from '../db/syncJournal';
import type { EventSnapshot, RaceEvent } from '../types';
import { syncService } from './syncService';
import { getCategoryProfileIds } from './categoryProfileService';

export async function calculateSHA256(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback simple checksum if subtle not available
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

export async function createFullSnapshot(event: RaceEvent): Promise<EventSnapshot> {
  const [
    participants,
    timingRecords,
    shootingResults,
    waves,
    profiles,
    categories,
    operations,
    conflicts,
    auditLogs,
    devices,
  ] = await Promise.all([
    db.participants.toArray(),
    db.timingRecords.toArray(),
    db.shootingResults.toArray(),
    db.waves.toArray(),
    db.raceProfiles.toArray(),
    db.categories.toArray(),
    db.operations.toArray(),
    db.conflicts.toArray(),
    db.auditLogs.toArray(),
    db.devices.toArray(),
  ]);

  const rawData = {
    syncEntities: await db.syncEntities.where('eventId').equals(event.id).toArray(),
    event,
    participants,
    timingRecords,
    shootingResults,
    waves,
    profiles,
    categories,
    operations,
    conflicts,
    auditLogs,
    devices,
    syncConfig: syncService.getConfig(),
    stamhoofdConfigs: await db.stamhoofdConfigs.toArray(),
  };

  const jsonString = JSON.stringify(rawData);
  const checksum = await calculateSHA256(jsonString);

  const snapshot: EventSnapshot = {
    snapshotId: `snapshot_${Date.now()}`,
    eventId: event.id,
    timestamp: new Date().toISOString(),
    checksum,
    data: rawData,
  };

  await db.snapshots.put(snapshot);
  return snapshot;
}

export function downloadJsonFile(data: any, fileName: string) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCsvFile(csvContent: string, fileName: string) {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface RecoveryValidation {
  isValid: boolean;
  error?: string;
  checksumMatch: boolean;
  eventDetails?: {
    id: string;
    name: string;
    date: string;
    participantsCount: number;
    timingRecordsCount: number;
    shootingCount: number;
  };
  diff: {
    participantsDiff: number;
    finishesDiff: number;
    shootingDiff: number;
  };
  snapshot?: EventSnapshot;
}

export async function validateRecoveryFile(fileContent: string): Promise<RecoveryValidation> {
  try {
    const parsed = JSON.parse(fileContent);

    // Can be a raw EventSnapshot or data object
    const snapshot: EventSnapshot = parsed.snapshotId ? parsed : {
      snapshotId: `import_${Date.now()}`,
      eventId: parsed.event?.id || 'event-imported',
      timestamp: new Date().toISOString(),
      checksum: '',
      data: parsed.data ? parsed.data : parsed,
    };

    const data = snapshot.data;
    if (!data || !data.event) {
      return {
        isValid: false,
        error: 'Bestand bevat geen geldige evenementstructuur',
        checksumMatch: false,
        diff: { participantsDiff: 0, finishesDiff: 0, shootingDiff: 0 },
      };
    }

    // Checksum verification
    let checksumMatch = true;
    if (snapshot.checksum) {
      const computedHash = await calculateSHA256(JSON.stringify(data));
      checksumMatch = computedHash === snapshot.checksum;
    }

    const currentParticipants = await db.participants.count();
    const currentFinishes = await db.timingRecords.where('type').equals('FINISH').count();
    const currentShooting = await db.shootingResults.count();

    const incomingParticipants = data.participants?.length || 0;
    const incomingFinishes = (data.timingRecords || []).filter((r: any) => r.type === 'FINISH').length;
    const incomingShooting = data.shootingResults?.length || 0;

    return {
      isValid: true,
      checksumMatch,
      eventDetails: {
        id: data.event.id,
        name: data.event.name,
        date: data.event.date,
        participantsCount: incomingParticipants,
        timingRecordsCount: (data.timingRecords || []).length,
        shootingCount: incomingShooting,
      },
      diff: {
        participantsDiff: incomingParticipants - currentParticipants,
        finishesDiff: incomingFinishes - currentFinishes,
        shootingDiff: incomingShooting - currentShooting,
      },
      snapshot,
    };
  } catch (err: any) {
    return {
      isValid: false,
      error: `Fout bij parseren: ${err?.message || 'Ongeldig JSON bestand'}`,
      checksumMatch: false,
      diff: { participantsDiff: 0, finishesDiff: 0, shootingDiff: 0 },
    };
  }
}

export async function restoreSnapshot(snapshot: EventSnapshot): Promise<void> {
  const data = snapshot.data;
  await db.transaction(
    'rw',
    [
      db.syncEntities,
      db.events,
      db.participants,
      db.timingRecords,
      db.shootingResults,
      db.waves,
      db.raceProfiles,
      db.categories,
      db.operations,
      db.conflicts,
      db.auditLogs,
      db.devices,
      db.stamhoofdConfigs,
    ],
    async () => {
      suppressSyncJournal();
      // Clear existing
      await Promise.all([
        db.syncEntities.clear(),
        db.events.clear(),
        db.participants.clear(),
        db.timingRecords.clear(),
        db.shootingResults.clear(),
        db.waves.clear(),
        db.raceProfiles.clear(),
        db.categories.clear(),
        db.operations.clear(),
        db.conflicts.clear(),
        db.devices.clear(),
        db.stamhoofdConfigs.clear(),
        db.auditLogs.clear(),
      ]);

      // Bulk restore
      if (data.syncEntities?.length) await db.syncEntities.bulkPut(data.syncEntities);
      if (data.event) await db.events.put(data.event);
      if (data.participants?.length) await db.participants.bulkPut(data.participants);
      if (data.timingRecords?.length) await db.timingRecords.bulkPut(data.timingRecords);
      if (data.shootingResults?.length) await db.shootingResults.bulkPut(data.shootingResults);
      if (data.waves?.length) await db.waves.bulkPut(data.waves);
      if (data.profiles?.length) await db.raceProfiles.bulkPut(data.profiles);
      if (data.categories?.length) {
        await db.categories.bulkPut(
          data.categories.map((category) => {
            const raceProfileIds = getCategoryProfileIds(category);
            return { ...category, raceProfileIds, raceProfileId: raceProfileIds[0] };
          })
        );
      }
      if (data.operations?.length) await db.operations.bulkPut(data.operations);
      if (data.conflicts?.length) await db.conflicts.bulkPut(data.conflicts);
      if (data.auditLogs?.length) await db.auditLogs.bulkPut(data.auditLogs);
      if (data.devices?.length) await db.devices.bulkPut(data.devices);
      if (data.stamhoofdConfigs?.length) await db.stamhoofdConfigs.bulkPut(data.stamhoofdConfigs);

      if (data.syncConfig) {
        syncService.saveConfig(data.syncConfig);
      }

      await db.auditLogs.add({
        id: `audit_${Date.now()}`,
        timestamp: new Date().toISOString(),
        deviceId: 'RECOVERY',
        operator: 'Admin',
        action: 'RESTORE_SNAPSHOT',
        details: `Snapshot ${snapshot.snapshotId} hersteld voor event ${data.event.name}`,
      });
    }
  );
}
