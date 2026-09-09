import { raceClock } from './raceClock';
import { RealtimeClient } from '@supabase/realtime-js';
import { db } from '../db/dexieDb';
import type { RaceOperation, ShootingResult, TimingRecord } from '../types';
import { suppressSyncJournal, syncedTables, getSyncDeviceId, entityKey } from '../db/syncJournal';
import { applyEntityOperation, acceptLegacyPatch, seedSyncJournal } from './entitySync';

export type NetworkState = 'ONLINE_SYNCED' | 'OFFLINE_PENDING' | 'SYNCING' | 'SYNC_ERROR';

export interface SyncConfig {
  enabled: boolean;
  projectUrl: string;
  anonKey: string;
  eventId: string;
}

const SYNC_CONFIG_KEY = 'biathlon_sync_config';

const defaultConfig: SyncConfig = {
  enabled: false,
  projectUrl: '',
  anonKey: '',
  eventId: '',
};

export class SyncService {
  private isSimulatedOffline = false;
  private listeners: Array<() => void> = [];
  private clockCheck?: Promise<number>;
  private syncing?: Promise<{ syncedCount: number; error?: string }>;
  private lastError?: string;
  private lastSyncAt?: string;
  private cloudRecords = 0;
  private replayUploads = false;
  private realtime?: RealtimeClient;
  private realtimeKey?: string;
  private realtimeStatus = 'disconnected';

  private stopRealtime() {
    this.realtime?.disconnect();
    this.realtime = undefined;
    this.realtimeKey = undefined;
    this.realtimeStatus = 'disconnected';
  }
  private ensureRealtime(config: SyncConfig) {
    if (typeof window === 'undefined') return;
    const key = JSON.stringify(config);
    if (this.realtimeKey === key) return;
    this.stopRealtime();
    this.realtimeKey = key;
    this.realtime = new RealtimeClient(`${config.projectUrl.replace(/^http/, 'ws')}/realtime/v1`, {
      params: { apikey: config.anonKey },
      // Publishable keys are API keys, not JWTs. The gateway supplies anon auth.
      ...(config.anonKey.startsWith('eyJ') ? { accessToken: async () => config.anonKey } : {}),
    });
    this.realtime.channel(`race:${config.eventId}`).on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'race_operations', filter: `event_id=eq.${config.eventId}`,
    }, () => { if (this.isCurrentConnection(config)) void this.syncNow(); }).subscribe(status => {
      if (this.realtimeKey !== key) return;
      this.realtimeStatus = status === 'SUBSCRIBED' ? 'connected' : 'disconnected';
      console.info('[SYNC] Realtime', this.realtimeStatus);
      this.triggerChange();
      if (status === 'SUBSCRIBED' && this.isCurrentConnection(config)) void this.syncNow();
    });
  }

  constructor(private readonly database = db) {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { this.triggerChange(); void this.syncNow(); });
      window.addEventListener('offline', () => this.triggerChange());

      // Periodic check of clock sync against reference
      void this.checkClockOffset();
      window.setInterval(() => { void this.checkClockOffset(); }, 60000);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private triggerChange() {
    this.listeners.forEach((l) => l());
  }

  public getIsSimulatedOffline(): boolean {
    return this.isSimulatedOffline;
  }

  public getConfig(): SyncConfig {
    if (typeof localStorage === 'undefined') return { ...defaultConfig };
    try {
      return { ...defaultConfig, ...JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY) || '{}') };
    } catch {
      return { ...defaultConfig };
    }
  }

  public saveConfig(config: SyncConfig): void {
    this.stopRealtime();
    this.lastSyncAt = undefined;
    this.cloudRecords = 0;
    const normalized = {
      ...config,
      projectUrl: config.projectUrl.trim().replace(/\/$/, ''),
      anonKey: config.anonKey.trim(),
      eventId: config.eventId.trim(),
    };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(normalized));
    }
    raceClock.reset(normalized.projectUrl);
    if (normalized.enabled) void this.checkClockOffset();
    this.triggerChange();
  }

  public async testConnection(config = this.getConfig()): Promise<{ ok: boolean; error?: string }> {
    if (!config.projectUrl || !config.anonKey) {
      return { ok: false, error: 'Supabase Project URL en anon key zijn verplicht.' };
    }

    try {
      const response = await fetch(`${config.projectUrl}/rest/v1/race_operations?select=operation_id&limit=1`, {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
        },
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 180);
        if (response.status === 401) {
          return { ok: false, error: 'HTTP 401: de publishable/anon key is ongeldig of onvolledig.' };
        }
        if (response.status === 404) {
          return { ok: false, error: 'HTTP 404: tabel race_operations bestaat nog niet.' };
        }
        if (response.status === 403) {
          return { ok: false, error: 'HTTP 403: RLS blokkeert lezen. Voeg de SELECT-policy uit de handleiding toe.' };
        }
        return { ok: false, error: `Supabase antwoordde met HTTP ${response.status}: ${detail}` };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Supabase is niet bereikbaar. Controleer URL en internetverbinding.' };
    }
  }

  public setSimulatedOffline(offline: boolean) {
    this.isSimulatedOffline = offline;
    if (offline) this.stopRealtime();
    else if (typeof window !== 'undefined') void this.syncNow();
    this.triggerChange();
  }

  public getClockOffsetMs(): number { return raceClock.status().offsetMs; }
  public getClockStatus() { return raceClock.status(); }
  public getSyncHealth() { return { lastError: this.lastError, lastSyncAt: this.lastSyncAt, cloudRecords: this.cloudRecords, syncing: !!this.syncing, deviceId: getSyncDeviceId(), realtime: this.realtimeStatus }; }
  public async getDiagnostics() {
    const eventId = this.getConfig().eventId;
    const pending = await this.database.operations.where('eventId').equals(eventId).filter(op => op.syncStatus === 'LOCAL_ONLY').toArray();
    return syncedTables.map(table => ({ table, pending: pending.filter(op => op.payload?.table === table ||
      (table === 'timingRecords' && ['START_RECORDED', 'FINISH_RECORDED', 'RECORD_UNDO'].includes(op.type)) ||
      (table === 'shootingResults' && op.type === 'SHOOTING_RECORDED')).length }));
  }
  public checkClockOffset(): Promise<number> {
    if (this.clockCheck) return this.clockCheck;
    const config = this.getConfig();
    if (!config.enabled || !config.projectUrl || !config.anonKey || this.isSimulatedOffline) return Promise.resolve(raceClock.status().offsetMs);
    this.clockCheck = raceClock.synchronize(config.projectUrl, async () => {
      const response = await fetch(`${config.projectUrl}/rest/v1/rpc/race_server_time`, {
        method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(3000),
        headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!response.ok) throw new Error(`Tijdserver HTTP ${response.status}. Installeer supabase/reliability.sql in dit project.`);
      return Number(await response.json());
    }).then(status => { this.triggerChange(); return status.offsetMs; }).finally(() => { this.clockCheck = undefined; });
    return this.clockCheck;
  }

  private async refreshParticipantStatus(participantId: string) {
    const p = await this.database.participants.get(participantId);
    if (!p || (p.eventId && p.eventId !== this.getConfig().eventId) || ['DNS', 'DNF', 'DSQ'].includes(p.status)) return;
    const timing = (await this.database.timingRecords.toArray()).filter(t => t.eventId === this.getConfig().eventId && !t.isReversed && (t.participantId === p.id || t.bibNumber === p.bibNumber));
    await this.database.participants.update(p.id, { status: timing.some(t => t.type === 'FINISH') ? 'FINISHED' : timing.some(t => t.type === 'START') ? 'STARTED' : 'READY' });
  }

  public async getPendingCount(): Promise<number> {
    try {
      return await this.database.operations.where('syncStatus').equals('LOCAL_ONLY').filter(op => op.eventId === this.getConfig().eventId).count();
    } catch {
      return 0;
    }
  }

  private async applyRemoteOperation(operation: RaceOperation): Promise<void> {
    const payload = operation.payload || {};
    if (operation.type === 'ENTITY_UPSERT' || operation.type === 'ENTITY_DELETED') {
      await applyEntityOperation(this.database, operation);
      const participantId = payload.table === 'participants' ? payload.recordId : payload.table === 'timingRecords' ? payload.record?.participantId : undefined;
      if (participantId && (payload.table === 'timingRecords' || await this.database.timingRecords.where('participantId').equals(participantId).filter(t => t.eventId === operation.eventId).count())) {
        await this.refreshParticipantStatus(participantId);
      }
      return;
    }

    if (operation.type === 'START_RECORDED' || operation.type === 'FINISH_RECORDED') {
      const recordId = String(payload.recordId || '');
      if ((await this.database.syncEntities.get(entityKey(operation.eventId, 'timingRecords', recordId)))?.deletedAt) return;
      if (!recordId || (await this.database.timingRecords.get(recordId))) return;

      const record: TimingRecord = {
        id: recordId,
        eventId: operation.eventId,
        participantId: operation.participantId,
        bibNumber: Number(payload.bibNumber || 0),
        type: operation.type === 'START_RECORDED' ? 'START' : 'FINISH',
        timestamp: String(payload.timestamp || operation.deviceTimestamp),
        monotonicMs: Number(payload.monotonicMs || 0),
        clockOffsetMs: Number(payload.clockOffsetMs || 0),
        clockSource: payload.clockSource, clockUncertaintyMs: payload.clockUncertaintyMs,
        clockSyncedAt: payload.clockSyncedAt, localTimestamp: payload.localTimestamp,
        deviceId: operation.deviceId,
        operatorId: operation.operatorId,
        isUnknownBib: Boolean(payload.isUnknownBib),
        isConfirmed: true,
        syncStatus: 'SYNCED',
      };
      // A revoke can arrive before its original record (same upload batch or offline devices).
      const revokes = (await this.database.operations.toArray()).filter(op => op.eventId === record.eventId && ((op.type === 'RECORD_UNDO' && op.payload.recordId === record.id) || (op.type === 'CONFLICT_RESOLVED' && op.payload.discardedRecordId === record.id)));
      if (revokes.length) { record.isReversed = true; record.reversedReason = 'Herroepen door gesynchroniseerde correctie'; }
      const participant = record.participantId ? await this.database.participants.get(record.participantId) : undefined;
      if (participant?.bibNumber) record.bibNumber = participant.bibNumber;
      await this.database.timingRecords.put(record);
      const duplicates = await this.database.timingRecords.where({ bibNumber: record.bibNumber, type: record.type }).filter(t => t.eventId === record.eventId && !t.isReversed && t.id !== record.id).toArray();
      for (const other of record.isReversed ? [] : duplicates) await this.database.conflicts.put({ id: `conflict-${[other.id, record.id].sort().join('-')}`, eventId: record.eventId, participantId: record.participantId ?? '', bibNumber: record.bibNumber, type: record.type === 'START' ? 'START_CONFLICT' : 'FINISH_CONFLICT', recordA: other, recordB: record, createdAt: operation.deviceTimestamp });
      if (operation.participantId) await this.refreshParticipantStatus(operation.participantId);
      return;
    }

    if (operation.type === 'SHOOTING_RECORDED') {
      const recordId = String(payload.recordId || '');
      if ((await this.database.syncEntities.get(entityKey(operation.eventId, 'shootingResults', recordId)))?.deletedAt) return;
      if (!recordId || (await this.database.shootingResults.get(recordId))) return;

      const result: ShootingResult = {
        id: recordId,
        eventId: operation.eventId,
        participantId: operation.participantId || '',
        bibNumber: Number(payload.bibNumber || 0),
        round: Number(payload.round || 1),
        station: String(payload.station || ''),
        timestamp: operation.deviceTimestamp,
        shots: Number(payload.shots || Number(payload.hits || 0) + Number(payload.misses || 0)),
        hits: Number(payload.hits || 0),
        misses: Number(payload.misses || 0),
        targetDetails: payload.targetDetails,
        isCorrection: Boolean(payload.isCorrection),
        supersedesIds: Array.isArray(payload.supersedesIds) ? payload.supersedesIds : undefined,
        correctionReason: payload.correctionReason,
        operatorId: operation.operatorId,
        deviceId: operation.deviceId,
        syncStatus: 'SYNCED',
      };
      await this.database.shootingResults.put(result);
      return;
    }

    if (operation.type === 'WAVE_STARTED' && payload.waveId) {
      if (!await acceptLegacyPatch(this.database, operation, 'waves', String(payload.waveId))) return;
      await this.database.waves.update(String(payload.waveId), {
        actualStartTime: String(payload.timestamp || operation.deviceTimestamp),
        status: 'STARTED',
      });
      return;
    }

    if ((operation.type === 'PARTICIPANT_UPDATED' || operation.type === 'STATUS_CHANGED' || operation.type === 'BIB_ASSIGNED') && operation.participantId) {
      if (!await acceptLegacyPatch(this.database, operation, 'participants', operation.participantId)) return;
      const patch = payload.updates || payload;
      const allowed = Object.fromEntries(['firstName','lastName','birthDate','gender','categoryId','raceProfileId','waveId','bibNumber','status','statusReason','penaltyLapsCompleted'].filter(key => key in patch).map(key => [key, patch[key]]));
      await this.database.participants.update(operation.participantId, allowed);
      if (allowed.bibNumber) {
        await this.database.timingRecords.where('participantId').equals(operation.participantId).modify({ bibNumber: allowed.bibNumber });
        await this.database.shootingResults.where('participantId').equals(operation.participantId).modify({ bibNumber: allowed.bibNumber });
      }
      return;
    }

    if (operation.type === 'CONFLICT_RESOLVED' && payload.discardedRecordId) {
      const target = await this.database.timingRecords.get(payload.discardedRecordId);
      if (target && target.eventId !== operation.eventId) throw new Error('Correctie verwijst naar ander evenement.');
      await this.database.timingRecords.update(payload.discardedRecordId, { isReversed: true, reversedReason: payload.reason });
      await this.database.conflicts.filter(c => c.id === payload.conflictId || (c.recordA.id === payload.discardedRecordId && c.recordB.id === payload.chosenRecordId) || (c.recordB.id === payload.discardedRecordId && c.recordA.id === payload.chosenRecordId)).modify({ resolvedAt: operation.deviceTimestamp, resolvedReason: payload.reason, resolvedWinner: payload.selectedWinner });
      if (operation.participantId) await this.refreshParticipantStatus(operation.participantId);
      return;
    }
    if (operation.type === 'RECORD_UNDO' && payload.recordId) {
      const target = await this.database.timingRecords.get(String(payload.recordId));
      if (target && target.eventId !== operation.eventId) throw new Error('Correctie verwijst naar ander evenement.');
      await this.database.timingRecords.update(String(payload.recordId), {
        isReversed: true,
        reversedReason: String(payload.reason || 'Online undo'),
      });
      if (operation.participantId) await this.refreshParticipantStatus(operation.participantId);
    }
  }

  private async pullRemoteOperations(config: SyncConfig): Promise<number> {
    let applied = 0;
    let cloudRecords = 0;
    for (let offset = 0; ; offset += 500) {
    const response = await fetch(
      `${config.projectUrl}/rest/v1/race_operations?event_id=eq.${encodeURIComponent(config.eventId)}&order=created_at.asc,operation_id.asc&limit=500&offset=${offset}`,
      {
        signal: AbortSignal.timeout(15000), cache: 'no-store',
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
        },
      }
    );
    if (!response.ok) throw new Error(`Download synchronisatie mislukt (HTTP ${response.status}).`);

    const rows = (await response.json()) as Array<Record<string, any>>;
    cloudRecords += rows.length;
    for (const row of rows) {
      if (String(row.event_id) !== config.eventId) continue;
      const operation: RaceOperation = {
        operationId: String(row.operation_id),
        eventId: String(row.event_id),
        participantId: row.participant_id || undefined,
        type: row.type,
        deviceId: String(row.device_id),
        operatorId: String(row.operator_id),
        deviceTimestamp: String(row.device_timestamp),
        serverTimestamp: row.server_timestamp || undefined,
        payload: row.payload || {},
        syncStatus: 'SYNCED',
        revision: Number(row.revision || 1),
      };

      await this.database.transaction('rw', [this.database.events, this.database.operations, this.database.timingRecords, this.database.shootingResults, this.database.participants, this.database.waves, this.database.conflicts, this.database.raceProfiles, this.database.categories, this.database.syncEntities], async () => {
        suppressSyncJournal();
        // A reset can finish while the HTTP request is still in flight. Check
        // inside the transaction so old operations cannot repopulate a new event.
        if (!this.isCurrentConnection(config) || !await this.database.events.get(config.eventId)) return;
        if (await this.database.operations.get(operation.operationId)) return;
        await this.database.operations.put(operation);
        await this.applyRemoteOperation(operation);
        applied += 1;
      });
    }
    if (rows.length < 500 || !this.isCurrentConnection(config)) break;
    }
    if (this.isCurrentConnection(config)) this.cloudRecords = cloudRecords;
    return applied;
  }

  private isCurrentConnection(config: SyncConfig): boolean {
    const current = this.getConfig();
    return current.enabled && current.eventId === config.eventId && current.projectUrl === config.projectUrl && current.anonKey === config.anonKey;
  }

  public syncNow(): Promise<{ syncedCount: number; error?: string }> {
    if (this.syncing) return this.syncing;
    this.syncing = this.performSync().then(result => {
      this.lastError = result.error;
      if (!result.error) this.lastSyncAt = raceClock.nowISO();
      this.triggerChange();
      return result;
    }).finally(() => { this.syncing = undefined; this.triggerChange(); });
    this.triggerChange();
    return this.syncing;
  }
  /** A complete log merge; never clears IndexedDB or treats absence as deletion. */
  public async fullSync() {
    if (this.syncing) await this.syncing;
    this.replayUploads = true;
    const first = await this.syncNow();
    if (first.error) return first;
    // Also uploads edits made while the first HTTP cycle was in flight.
    const second = await this.syncNow();
    return { syncedCount: first.syncedCount + second.syncedCount, error: second.error };
  }
  private async performSync(): Promise<{ syncedCount: number; error?: string }> {
    if (this.isSimulatedOffline || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      return { syncedCount: 0, error: 'Apparaat is offline' };
    }

    try {
      const config = this.getConfig();
      if (!config.enabled) {
        return { syncedCount: 0, error: 'Online synchronisatie is niet geconfigureerd.' };
      }
      if (!config.projectUrl || !config.anonKey) {
        return { syncedCount: 0, error: 'Supabase Project URL en anon key ontbreken.' };
      }
      const activeEvent = await this.database.events.toCollection().first();
      if (!config.eventId || activeEvent?.id !== config.eventId) {
        return { syncedCount: 0, error: 'Het Supabase Event-ID moet overeenkomen met het huidige evenement.' };
      }

      try { this.ensureRealtime(config); }
      catch { this.stopRealtime(); console.warn('[SYNC] Realtime niet beschikbaar; periodieke sync blijft actief.'); }
      await seedSyncJournal(this.database, config.eventId);
      const replay = this.replayUploads;
      this.replayUploads = false;
      const uploadable = await this.database.operations.where('eventId').equals(config.eventId).filter(op => replay || op.syncStatus === 'LOCAL_ONLY').toArray();
      let uploaded = 0;
      for (let offset = 0; offset < uploadable.length; offset += 200) {
      if (!this.isCurrentConnection(config) || !await this.database.events.get(config.eventId)) return { syncedCount: uploaded };
      const batch = uploadable.slice(offset, offset + 200);
      const response = await fetch(`${config.projectUrl}/rest/v1/race_operations?on_conflict=operation_id`, {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify(
          batch.map((operation) => ({
            operation_id: operation.operationId,
            event_id: operation.eventId,
            participant_id: operation.participantId || null,
            type: operation.type,
            device_id: operation.deviceId,
            operator_id: operation.operatorId,
            device_timestamp: operation.deviceTimestamp,
            server_timestamp: operation.serverTimestamp || null,
            payload: operation.payload,
            revision: operation.revision,
          }))
        ),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 240);
        return {
          syncedCount: 0,
          error: `Supabase synchronisatie mislukt (HTTP ${response.status}): ${detail}`,
        };
      }

      await this.database.transaction('rw', this.database.events, this.database.operations, async () => {
        if (!this.isCurrentConnection(config) || !await this.database.events.get(config.eventId)) return;
        for (const op of batch) await this.database.operations.update(op.operationId, {
          syncStatus: 'SYNCED', serverTimestamp: new Date().toISOString(),
        });
      });
      uploaded += batch.length;
      console.info('[SYNC] Upload bevestigd', batch.length);
      }
      if (!this.isCurrentConnection(config) || !await this.database.events.get(config.eventId)) return { syncedCount: uploaded };
      const pulledCount = await this.pullRemoteOperations(config);
      this.triggerChange();
      console.info('[SYNC] Sync complete', { uploaded, downloaded: pulledCount });
      return { syncedCount: uploaded + pulledCount };
    } catch (err: any) {
      return { syncedCount: 0, error: err?.message || 'Synchronisatiefout' };
    }
  }
}

export const syncService = new SyncService();
