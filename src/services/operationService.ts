import { raceClock } from './raceClock';
import { db } from '../db/dexieDb';
import type {
  RaceOperation,
  TimingRecord,
  ShootingResult,
  Participant,
  AuditLog,
  RaceConflict,
  SyncStatus,
} from '../types';

import { generateUUID } from './uuid';
export { generateUUID } from './uuid';

// BroadcastChannel for cross-tab and multi-device local simulated synchronization
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  broadcastChannel = new BroadcastChannel('biathlon_race_sync');
}

export class OperationService {
  private currentDeviceId = 'FINISH-01';
  private currentOperator = 'Operator';

  public setDeviceAndOperator(deviceId: string, operator: string) {
    this.currentDeviceId = deviceId;
    this.currentOperator = operator;
  }

  public getDeviceId(): string {
    return this.currentDeviceId;
  }

  public getOperator(): string {
    return this.currentOperator;
  }

  /**
   * Log an audit action
   */
  public async logAudit(
    action: string,
    details: string,
    participantId?: string,
    bibNumber?: number,
    reason?: string
  ): Promise<AuditLog> {
    const log: AuditLog = {
      id: generateUUID(),
      timestamp: new Date().toISOString(),
      deviceId: this.currentDeviceId,
      operator: this.currentOperator,
      action,
      details,
      participantId,
      bibNumber,
      reason,
    };
    await db.auditLogs.add(log);
    return log;
  }

  /**
   * Records a finish time with failsafe T1 timestamp capture.
   * Immediately writes to IndexedDB and operations queue.
   */
  public async recordFinish(
    eventId: string,
    bibNumber: number,
    participant: Participant | undefined,
    capturedTimestamp: string,
    monotonicMs: number,
    clockOffsetMs = raceClock.status().offsetMs
  ): Promise<{ record: TimingRecord; conflict?: RaceConflict }> {
    return db.transaction('rw', [db.events, db.participants, db.timingRecords, db.shootingResults, db.operations, db.auditLogs, db.conflicts, db.waves], async () => {
    const active = await db.events.get(eventId);
    if (active?.officialResultsLocked) throw new Error('De uitslagen zijn vergrendeld. Ontgrendel eerst voor een correctie.');
    const recordId = generateUUID();
    const operationId = generateUUID();

    // Check if participant already has a non-reversed finish record (Conflict detection Req 33)
    let existingFinish: TimingRecord | undefined = undefined;
    if (participant) {
      existingFinish = await db.timingRecords
        .where({ bibNumber, type: 'FINISH' })
        .and((r) => r.eventId === eventId && !r.isReversed)
        .first();
    }

    const record: TimingRecord = {
      id: recordId,
      eventId,
      participantId: participant?.id,
      bibNumber,
      type: 'FINISH',
      timestamp: capturedTimestamp,
      monotonicMs,
      clockOffsetMs,
      clockSource: raceClock.status().source,
      clockSyncedAt: raceClock.status().syncedAt,
      clockUncertaintyMs: raceClock.status().uncertaintyMs,
      localTimestamp: new Date(Date.parse(capturedTimestamp) - clockOffsetMs).toISOString(),
      deviceId: this.currentDeviceId,
      operatorId: this.currentOperator,
      isUnknownBib: !participant,
      isConfirmed: true,
      syncStatus: 'LOCAL_ONLY' as SyncStatus,
    };

    // Save record to IndexedDB immediately
    await db.timingRecords.put(record);

    // If participant exists, update participant status to FINISHED
    if (participant) {
      await db.participants.update(participant.id, {
        status: 'FINISHED',
        updatedAt: new Date().toISOString(),
      });
    }

    // Check for conflict
    let conflict: RaceConflict | undefined = undefined;
    if (existingFinish && existingFinish.id !== record.id) {
      conflict = {
        id: generateUUID(),
        eventId,
        participantId: participant?.id || '',
        bibNumber,
        type: 'FINISH_CONFLICT',
        recordA: existingFinish,
        recordB: record,
        createdAt: new Date().toISOString(),
      };
      await db.conflicts.put(conflict);

      await this.logAudit(
        'FINISH_CONFLICT_DETECTED',
        `Conflict ontdekt voor bib #${bibNumber}: ${existingFinish.deviceId} (${existingFinish.timestamp}) vs ${this.currentDeviceId} (${record.timestamp})`,
        participant?.id,
        bibNumber
      );
    }

    // Save operation (immutable event log)
    const operation: RaceOperation = {
      operationId,
      eventId,
      participantId: participant?.id,
      type: 'FINISH_RECORDED',
      deviceId: this.currentDeviceId,
      operatorId: this.currentOperator,
      deviceTimestamp: capturedTimestamp,
      payload: {
        recordId,
        bibNumber,
        timestamp: capturedTimestamp,
        clockOffsetMs,
        clockSource: record.clockSource,
        clockUncertaintyMs: record.clockUncertaintyMs,
        clockSyncedAt: record.clockSyncedAt,
        localTimestamp: record.localTimestamp,
        monotonicMs,
        isUnknownBib: !participant,
      },
      syncStatus: 'LOCAL_ONLY',
      revision: 1,
    };

    await db.operations.put(operation);

    await this.logAudit(
      'FINISH_RECORDED',
      `Finish geregistreerd voor #${bibNumber} om ${capturedTimestamp}`,
      participant?.id,
      bibNumber
    );

    // Broadcast event
    this.broadcast({ type: 'FINISH_RECORDED', operation, record, conflict });

    return { record, conflict };
    });
  }

  /**
   * Records a start time (Individual or Mass start)
   */
  public async recordStart(
    eventId: string,
    bibNumber: number,
    participant: Participant | undefined,
    capturedTimestamp: string,
    monotonicMs: number,
    clockOffsetMs = raceClock.status().offsetMs
  ): Promise<TimingRecord> {
    return db.transaction('rw', [db.events, db.participants, db.timingRecords, db.shootingResults, db.operations, db.auditLogs, db.conflicts, db.waves], async () => {
    const active = await db.events.get(eventId);
    if (active?.officialResultsLocked) throw new Error('De uitslagen zijn vergrendeld. Ontgrendel eerst voor een correctie.');
    const recordId = generateUUID();
    const operationId = generateUUID();

    const record: TimingRecord = {
      id: recordId,
      eventId,
      participantId: participant?.id,
      bibNumber,
      type: 'START',
      timestamp: capturedTimestamp,
      monotonicMs,
      clockOffsetMs,
      clockSource: raceClock.status().source,
      clockSyncedAt: raceClock.status().syncedAt,
      clockUncertaintyMs: raceClock.status().uncertaintyMs,
      localTimestamp: new Date(Date.parse(capturedTimestamp) - clockOffsetMs).toISOString(),
      deviceId: this.currentDeviceId,
      operatorId: this.currentOperator,
      isUnknownBib: !participant,
      isConfirmed: true,
      syncStatus: 'LOCAL_ONLY',
    };

    await db.timingRecords.put(record);

    if (participant) {
      await db.participants.update(participant.id, {
        status: 'STARTED',
        updatedAt: new Date().toISOString(),
      });
    }

    const operation: RaceOperation = {
      operationId,
      eventId,
      participantId: participant?.id,
      type: 'START_RECORDED',
      deviceId: this.currentDeviceId,
      operatorId: this.currentOperator,
      deviceTimestamp: capturedTimestamp,
      payload: {
        recordId,
        bibNumber,
        timestamp: capturedTimestamp,
        clockOffsetMs,
        clockSource: record.clockSource,
        clockUncertaintyMs: record.clockUncertaintyMs,
        clockSyncedAt: record.clockSyncedAt,
        localTimestamp: record.localTimestamp,
      },
      syncStatus: 'LOCAL_ONLY',
      revision: 1,
    };

    await db.operations.put(operation);

    await this.logAudit(
      'START_RECORDED',
      `Start geregistreerd voor #${bibNumber} om ${capturedTimestamp}`,
      participant?.id,
      bibNumber
    );

    this.broadcast({ type: 'START_RECORDED', operation, record });
    return record;
    });
  }

  /**
   * Mass start for all participants in a wave
   */
  public async recordMassWaveStart(
    eventId: string,
    waveId: string,
    waveNumber: number,
    participants: Participant[],
    capturedTimestamp: string
  ): Promise<void> {
    return db.transaction('rw', [db.events, db.participants, db.timingRecords, db.shootingResults, db.operations, db.auditLogs, db.conflicts, db.waves], async () => {
    const active = await db.events.get(eventId);
    if (active?.officialResultsLocked) throw new Error('De uitslagen zijn vergrendeld. Ontgrendel eerst voor een correctie.');
    const monotonic = performance.now();
    const wave = await db.waves.get(waveId);
    if (!wave || wave.eventId !== eventId || wave.actualStartTime || wave.status === 'STARTED' || wave.status === 'COMPLETED') throw new Error('Deze startgroep bestaat niet of is al gestart.');
    for (const p of participants) {
      const current = await db.participants.get(p.id);
      if (current?.waveId === waveId && current.bibNumber && ['REGISTERED', 'CHECKED_IN', 'READY'].includes(current.status)) {
        await this.recordStart(eventId, current.bibNumber, current, capturedTimestamp, monotonic);
      }
    }

    await db.waves.update(waveId, {
      actualStartTime: capturedTimestamp,
      status: 'STARTED',
    });

    const operation: RaceOperation = {
      operationId: generateUUID(),
      eventId,
      type: 'WAVE_STARTED',
      deviceId: this.currentDeviceId,
      operatorId: this.currentOperator,
      deviceTimestamp: capturedTimestamp,
      payload: { waveId, waveNumber, timestamp: capturedTimestamp, count: participants.length },
      syncStatus: 'LOCAL_ONLY',
      revision: 1,
    };

    await db.operations.put(operation);

    await this.logAudit(
      'WAVE_STARTED',
      `Mass start voor Wave ${waveNumber} (${participants.length} deelnemers) om ${capturedTimestamp}`
    );

    this.broadcast({ type: 'WAVE_STARTED', operation, waveId });
    });
  }

  /**
   * Records a shooting result for a round
   */
  public async recordShooting(
    eventId: string,
    participant: Participant,
    round: number,
    station: string,
    shots: number,
    hits: number,
    misses: number,
    targetDetails?: boolean[],
    isCorrection = false,
    correctionReason?: string
  ): Promise<ShootingResult> {
    return db.transaction('rw', [db.events, db.participants, db.timingRecords, db.shootingResults, db.operations, db.auditLogs, db.conflicts, db.waves], async () => {
    const active = await db.events.get(eventId);
    if (active?.officialResultsLocked) throw new Error('De uitslagen zijn vergrendeld. Ontgrendel eerst voor een correctie.');
    const recordId = generateUUID();
    const operationId = generateUUID();
    const timestamp = raceClock.nowISO();

    if (![round, shots, hits, misses].every(Number.isSafeInteger) || round < 1 || shots < 1 || hits < 0 || misses < 0 || hits + misses !== shots) throw new Error('Ongeldige schietregistratie.');
    const prior = await db.shootingResults.where('participantId').equals(participant.id).filter(r => r.eventId === eventId && r.round === round).toArray();
    if (!isCorrection && prior.some(r => !r.isCorrected)) throw new Error('Deze schietbeurt bestaat al. Gebruik een correctie.');
    if (isCorrection && !correctionReason?.trim()) throw new Error('Geef een reden voor de correctie.');
    const supersedesIds = isCorrection ? prior.map(r => r.id) : [];
    const record: ShootingResult = {
      supersedesIds,
      id: recordId,
      eventId,
      participantId: participant.id,
      bibNumber: participant.bibNumber || 0,
      round,
      station,
      timestamp,
      shots,
      hits,
      misses,
      targetDetails,
      operatorId: this.currentOperator,
      deviceId: this.currentDeviceId,
      isCorrection,
      correctionReason,
      syncStatus: 'LOCAL_ONLY',
    };

    await db.shootingResults.put(record);

    const operation: RaceOperation = {
      operationId,
      eventId,
      participantId: participant.id,
      type: 'SHOOTING_RECORDED',
      deviceId: this.currentDeviceId,
      operatorId: this.currentOperator,
      deviceTimestamp: timestamp,
      payload: {
        recordId,
        bibNumber: participant.bibNumber,
        round,
        station,
          shots,
        hits,
        misses,
          targetDetails,
        isCorrection,
        supersedesIds,
        correctionReason,
      },
      syncStatus: 'LOCAL_ONLY',
      revision: 1,
    };

    await db.operations.put(operation);

    await this.logAudit(
      isCorrection ? 'SHOOTING_CORRECTED' : 'SHOOTING_RECORDED',
      `Schietronde ${round} voor #${participant.bibNumber}: ${hits}/${shots} hits, ${misses} missers ${
        correctionReason ? `(Reden: ${correctionReason})` : ''
      }`,
      participant.id,
      participant.bibNumber,
      correctionReason
    );

    this.broadcast({ type: 'SHOOTING_RECORDED', operation, record });
    return record;
    });
  }

  /**
   * Undo the last timing record for a bib (without hard deleting, preserves audit history)
   */
  public async undoTimingRecord(recordId: string, reason = 'Operator undo'): Promise<void> {
    return db.transaction('rw', [db.events, db.participants, db.timingRecords, db.shootingResults, db.operations, db.auditLogs, db.conflicts, db.waves], async () => {
    const record = await db.timingRecords.get(recordId);
    if (!record) return;
    if ((await db.events.get(record.eventId))?.officialResultsLocked) throw new Error('De uitslagen zijn vergrendeld.');

    await db.timingRecords.update(recordId, {
      isReversed: true,
      reversedReason: reason,
    });

    // Revert participant status if needed
    if (record.participantId) {
      if (record.type === 'FINISH') {
        await db.participants.update(record.participantId, {
          status: 'STARTED',
          updatedAt: new Date().toISOString(),
        });
      } else if (record.type === 'START') {
        await db.participants.update(record.participantId, {
          status: 'READY',
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const op: RaceOperation = {
      operationId: generateUUID(),
      eventId: record.eventId,
      participantId: record.participantId,
      type: 'RECORD_UNDO',
      deviceId: this.currentDeviceId,
      operatorId: this.currentOperator,
      deviceTimestamp: new Date().toISOString(),
      payload: { recordId, bibNumber: record.bibNumber, type: record.type, reason },
      syncStatus: 'LOCAL_ONLY',
      revision: 1,
    };
    await db.operations.put(op);

    await this.logAudit(
      'RECORD_UNDO',
      `Undo ${record.type} voor #${record.bibNumber}. Reden: ${reason}`,
      record.participantId,
      record.bibNumber,
      reason
    );

    this.broadcast({ type: 'RECORD_UNDO', recordId, bibNumber: record.bibNumber });
    });
  }

  public async correctTimingRecord(recordId: string, timestamp: string, reason: string) {
    if (!reason.trim() || !Number.isFinite(Date.parse(timestamp))) throw new Error('Een geldige tijd en reden zijn verplicht.');
    return db.transaction('rw', [db.events, db.participants, db.timingRecords, db.shootingResults, db.operations, db.auditLogs, db.conflicts, db.waves], async () => {
      const old = await db.timingRecords.get(recordId);
      if (!old) throw new Error('Tijdregistratie bestaat niet meer.');
      const p = old.participantId ? await db.participants.get(old.participantId) : undefined;
      await this.undoTimingRecord(recordId, reason);
      if (old.type === 'START') return this.recordStart(old.eventId, old.bibNumber, p, timestamp, performance.now(), 0);
      return this.recordFinish(old.eventId, old.bibNumber, p, timestamp, performance.now(), 0);
    });
  }

  private broadcast(message: any) {
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage(message);
      } catch {
        // ignore
      }
    }
  }

  public onBroadcastMessage(callback: (msg: any) => void) {
    if (broadcastChannel) {
      broadcastChannel.onmessage = (event) => callback(event.data);
    }
  }
}

export const operationService = new OperationService();
