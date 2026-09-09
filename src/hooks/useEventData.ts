import { useState, useEffect, useCallback } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../db/dexieDb';
import { operationService } from '../services/operationService';
import { syncService } from '../services/syncService';
import { calculateRaceResults } from '../services/timingEngine';
import { initializeEmptyEvent } from '../services/sampleDataService';
import type {
  RaceEvent,
  Participant,
  TimingRecord,
  ShootingResult,
  Wave,
  Category,
  RaceProfile,
  RaceConflict,
  AuditLog,
  RaceResult,
  DeviceConfig,
} from '../types';

export function useEventData() {
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<RaceEvent | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [timingRecords, setTimingRecords] = useState<TimingRecord[]>([]);
  const [shootingResults, setShootingResults] = useState<ShootingResult[]>([]);
  const [waves, setWaves] = useState<Wave[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [raceProfiles, setRaceProfiles] = useState<RaceProfile[]>([]);
  const [conflicts, setConflicts] = useState<RaceConflict[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [deviceConfig, setDeviceConfig] = useState<DeviceConfig | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);

  const refresh = useCallback(async () => {
    try {
      let ev = await db.events.toCollection().first();
      const isInitialized = typeof window !== 'undefined' && localStorage.getItem('biathlon_db_initialized') === 'true';

      if (!ev && !isInitialized) {
        await initializeEmptyEvent();
        ev = await db.events.toCollection().first();
      }

      const [
        pList,
        tList,
        sList,
        wList,
        cList,
        profList,
        confList,
        aList,
        devList,
        pendingCount,
      ] = await Promise.all([
        db.participants.toArray(),
        db.timingRecords.toArray(),
        db.shootingResults.toArray(),
        db.waves.orderBy('waveNumber').toArray(),
        db.categories.toArray(),
        db.raceProfiles.toArray(),
        db.conflicts.toArray(),
        db.auditLogs.orderBy('timestamp').reverse().limit(100).toArray(),
        db.devices.toCollection().first(),
        syncService.getPendingCount(),
      ]);

      if (ev?.name && typeof document !== 'undefined') {
        document.title = `${ev.name} - Tijdregistratie Biathlon`;
      }

      setEvent(ev || null);
      setParticipants(pList.filter(p => !p.eventId || p.eventId === ev?.id));
      setTimingRecords(tList.filter(p => p.eventId === ev?.id));
      setShootingResults(sList.filter(p => p.eventId === ev?.id));
      setWaves(wList.filter(p => p.eventId === ev?.id));
      setCategories(cList.filter(p => !p.eventId || p.eventId === ev?.id));
      setRaceProfiles(profList.filter(p => !p.eventId || p.eventId === ev?.id));
      setConflicts(confList.filter(p => p.eventId === ev?.id));
      setAuditLogs(aList);
      setDeviceConfig(devList || null);
      setPendingSyncCount(pendingCount);
    } catch (err) {
      console.error('Error fetching event data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const changes = liveQuery(() => Promise.all([
      db.events.toArray(), db.participants.toArray(), db.waves.toArray(), db.categories.toArray(),
      db.raceProfiles.toArray(), db.timingRecords.toArray(), db.shootingResults.toArray(), db.conflicts.toArray(),
    ])).subscribe(() => { void refresh(); });
    void syncService.syncNow();

    // Listen to operations and local BroadcastChannel messages
    operationService.onBroadcastMessage(() => {
      refresh();
    });

    // Subscribe to sync service state changes
    const unsubSync = syncService.subscribe(() => {
      syncService.getPendingCount().then((count) => setPendingSyncCount(count));
    });

    // Poll periodically to catch internal Dexie changes
    const interval = setInterval(refresh, 2000);
    const syncInterval = setInterval(() => {
      syncService.syncNow().then(() => refresh());
    }, 5000);

    return () => {
      unsubSync();
      changes.unsubscribe();
      clearInterval(interval);
      clearInterval(syncInterval);
    };
  }, [refresh]);

  // Derived calculated race results
  const results: RaceResult[] = calculateRaceResults(
    participants,
    timingRecords,
    shootingResults,
    categories,
    waves,
    raceProfiles,
    event?.penaltySecondsPerMiss || 20
  );

  return {
    loading,
    event,
    participants,
    timingRecords,
    shootingResults,
    waves,
    categories,
    raceProfiles,
    conflicts,
    auditLogs,
    deviceConfig,
    pendingSyncCount,
    results,
    refresh,
  };
}
