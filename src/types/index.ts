import type { StamhoofdSource } from './stamhoofd';

export type EventStatus =
  | 'DRAFT'
  | 'PREPARATION'
  | 'READY'
  | 'LIVE'
  | 'PAUSED'
  | 'FINISHED'
  | 'ARCHIVED';

export type ParticipantStatus =
  | 'REGISTERED'
  | 'CHECKED_IN'
  | 'DNS'
  | 'READY'
  | 'STARTED'
  | 'FINISHED'
  | 'DNF'
  | 'DSQ';

export type SyncStatus =
  | 'LOCAL_ONLY'
  | 'QUEUED'
  | 'SYNCING'
  | 'SYNCED'
  | 'CONFLICT'
  | 'ERROR';

export type UserRole =
  | 'ADMIN'
  | 'RACE_DIRECTOR'
  | 'REGISTRATION'
  | 'START_OPERATOR'
  | 'SHOOTING_OPERATOR'
  | 'FINISH_OPERATOR'
  | 'VIEWER';

export type LegType = 'RUN' | 'SHOOT' | 'PENALTY' | 'TRANSITION' | 'FINISH';
export type ShootingStance = 'prone' | 'standing' | 'free';
export type PenaltyType = 'time' | 'lap' | 'fixed' | 'none';

export interface RaceLegConfig {
  id: string;
  type: LegType;
  name: string;
  distanceMeters?: number;
  laps?: number;
  shotCount?: number;
  stance?: ShootingStance;
  maxHits?: number;
  penaltyType?: PenaltyType;
  penaltyValueSeconds?: number;
  penaltyLapsPerMiss?: number;
}

export interface SyncMetadata {
  eventId?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  updatedByDeviceId?: string;
}

export interface RaceProfile extends SyncMetadata {
  id: string;
  name: string;
  description: string;
  legs: RaceLegConfig[];
  penaltySecondsPerMiss: number;
  penaltyLapsPerMiss: number;
  isDefault?: boolean;
  articles?: string[];
}

export interface Category extends SyncMetadata {
  id: string;
  name: string;
  code: string;
  gender: 'M' | 'F' | 'ALL';
  minAge?: number;
  maxAge?: number;
  /** Alle wedstrijdprofielen die deelnemers uit deze categorie mogen gebruiken. */
  raceProfileIds: string[];
  /** Eerste/standaard profiel; behouden voor compatibiliteit met oudere back-ups. */
  raceProfileId?: string;
  defaultWaveId?: string;
  bibRangeStart?: number;
  bibRangeEnd?: number;
}

export interface Wave extends SyncMetadata {
  id: string;
  eventId: string;
  name: string;
  waveNumber: number;
  scheduledStartTime: string; // HH:mm:ss or ISO
  actualStartTime?: string;
  categoryIds: string[];
  maxParticipants: number;
  assignmentGroup?: { type: 'article' | 'profile'; value: string };
  status: 'SCHEDULED' | 'STARTED' | 'COMPLETED';
}

export interface Participant extends StamhoofdSource, SyncMetadata {
  id: string;
  externalId?: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
  gender?: 'M' | 'F' | 'X';
  email?: string;
  phone?: string;
  club?: string;
  team?: string;
  categoryId: string;
  raceProfileId: string;
  article?: string;
  penaltyLapsCompleted?: number;
  categoryAssignment?: 'automatic' | 'manual';
  profileAssignment?: 'automatic' | 'manual';
  bibNumber?: number;
  waveId?: string;
  notes?: string;
  status: ParticipantStatus;
  statusReason?: string;
  bibHistory?: Array<{
    oldBib: number;
    newBib: number;
    changedAt: string;
    reason?: string;
  }>;
  importBatchId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimingRecord extends SyncMetadata {
  localTimestamp?: string;
  clockSource?: string;
  clockUncertaintyMs?: number;
  clockSyncedAt?: string;
  id: string;
  eventId: string;
  participantId?: string;
  bibNumber: number;
  type: 'START' | 'FINISH';
  timestamp: string; // ISO string with ms precision
  monotonicMs: number;
  clockOffsetMs: number;
  deviceId: string;
  operatorId: string;
  isUnknownBib?: boolean;
  isConfirmed: boolean;
  isReversed?: boolean;
  reversedReason?: string;
  syncStatus: SyncStatus;
}

export interface ShootingResult extends SyncMetadata {
  supersedesIds?: string[];
  id: string;
  eventId: string;
  participantId: string;
  bibNumber: number;
  round: number; // 1, 2, 3...
  station: string;
  timestamp: string;
  shots: number; // e.g. 5
  hits: number;
  misses: number;
  targetDetails?: boolean[]; // true = hit, false = miss
  operatorId: string;
  deviceId: string;
  isCorrection?: boolean;
  isCorrected?: boolean;
  correctionReason?: string;
  syncStatus: SyncStatus;
}

export interface RaceOperation {
  operationId: string;
  eventId: string;
  participantId?: string;
  type:
    | 'ENTITY_UPSERT'
    | 'ENTITY_DELETED'
    | 'PARTICIPANT_CREATED'
    | 'PARTICIPANT_UPDATED'
    | 'BIB_ASSIGNED'
    | 'WAVE_STARTED'
    | 'START_RECORDED'
    | 'FINISH_RECORDED'
    | 'SHOOTING_RECORDED'
    | 'PENALTY_ADJUSTED'
    | 'RECORD_UNDO'
    | 'STATUS_CHANGED'
    | 'CONFLICT_RESOLVED';
  deviceId: string;
  operatorId: string;
  deviceTimestamp: string;
  serverTimestamp?: string;
  payload: Record<string, any>;
  syncStatus: SyncStatus;
  revision: number;
}

export interface RaceConflict {
  id: string;
  eventId: string;
  participantId: string;
  bibNumber: number;
  type: 'FINISH_CONFLICT' | 'START_CONFLICT' | 'SHOOTING_CONFLICT';
  recordA: TimingRecord | ShootingResult;
  recordB: TimingRecord | ShootingResult;
  createdAt: string;
  resolvedAt?: string;
  resolvedWinner?: 'A' | 'B' | 'MANUAL';
  resolvedReason?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  deviceId: string;
  operator: string;
  action: string;
  details: string;
  participantId?: string;
  bibNumber?: number;
  reason?: string;
}

export interface EventSnapshot {
  snapshotId: string;
  eventId: string;
  timestamp: string;
  checksum: string;
  data: {
    syncEntities?: import('../db/syncJournal').EntityVersion[];
    event: RaceEvent;
    participants: Participant[];
    timingRecords: TimingRecord[];
    shootingResults: ShootingResult[];
    waves: Wave[];
    profiles: RaceProfile[];
    categories: Category[];
    operations: RaceOperation[];
    conflicts: RaceConflict[];
    auditLogs?: AuditLog[];
    devices?: DeviceConfig[];
    stamhoofdConfigs?: import('./stamhoofd').StamhoofdConfig[];
    syncConfig?: {
      enabled: boolean;
      projectUrl: string;
      anonKey: string;
      eventId: string;
    };
  };
}

export interface RaceEvent {
  waveSettings?: { intervalMinutes: number; capacity: number; firstStartTime: string };
  id: string;
  name: string;
  date: string;
  location: string;
  organizer: string;
  status: EventStatus;
  timezone: string; // 'Europe/Brussels'
  penaltySecondsPerMiss: number;
  requireStartConfirmation: boolean;
  requireFinishConfirmation: boolean;
  isTestMode: boolean;
  isPublicResultsLive: boolean;
  officialResultsLocked: boolean;
  officialResultsVersion: string; // 'Draft' | 'Version 1' | 'Official'
  lockedAt?: string;
  lockedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceConfig {
  id: string;
  name: string;
  role: UserRole;
  operatorName?: string;
  stationName: string;
  pin?: string;
  isLocked: boolean;
  clockOffsetMs: number;
}

export interface RaceResult {
  resultIssues?: string[];
  penaltyLaps?: number;
  raceProfileId?: string;
  raceProfileName?: string;
  participantId: string;
  bibNumber: number;
  name: string;
  categoryName: string;
  categoryId: string;
  waveName: string;
  waveId?: string;
  gender: string;
  status: ParticipantStatus;
  statusReason?: string;
  startTime?: string;
  finishTime?: string;
  rawElapsedTimeMs?: number;
  rawElapsedFormatted: string;
  shootingRounds: Array<{
    id?: string;
    round: number;
    shots?: number;
    hits: number;
    misses: number;
    timestamp: string;
    station: string;
  }>;
  totalMisses: number;
  penaltySeconds: number;
  penaltyFormatted: string;
  officialTimeMs?: number;
  officialTimeFormatted: string;
  rankOverall?: number;
  rankCategory?: number;
  rankGender?: number;
  club?: string;
  team?: string;
  gapMs?: number;
  gapFormatted?: string;
  isPendingShooting?: boolean;
}

export interface ImportColumnMapping {
  externalId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  birthDate?: string;
  gender?: string;
  email?: string;
  phone?: string;
  category?: string;
  club?: string;
  team?: string;
  bibNumber?: string;
  notes?: string;
}
