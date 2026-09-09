import { effectiveShooting, shootingPenalty } from './shootingRules';
import type {
  Participant,
  TimingRecord,
  ShootingResult,
  Category,
  Wave,
  RaceProfile,
  RaceResult,
} from '../types';

/**
 * Format milliseconds into HH:mm:ss.SSS or mm:ss.SSS
 */
export function formatDuration(
  durationMs: number,
  includeMs = false,
  showHours = true
): string {
  if (isNaN(durationMs) || durationMs < 0) return '--:--';

  const totalSeconds = Math.floor(durationMs / 1000);
  const ms = Math.floor(durationMs % 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');

  let result = '';
  if (showHours || hours > 0) {
    result = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  } else {
    result = `${pad(minutes)}:${pad(seconds)}`;
  }

  if (includeMs) {
    result += `.${pad(ms, 3)}`;
  }

  return result;
}

/**
 * Format an ISO string to Belgian local time HH:mm:ss.SSS
 */
export function formatLocalTime(
  isoString?: string,
  includeMs = false
): string {
  if (!isoString) return '--:--:--';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '--:--:--';

    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    let out = `${hours}:${minutes}:${seconds}`;
    if (includeMs) {
      const ms = String(d.getMilliseconds()).padStart(3, '0');
      out += `.${ms}`;
    }
    return out;
  } catch {
    return '--:--:--';
  }
}

/**
 * High-performance timestamp capture
 * Captures wall-clock ISO string + high resolution monotonic time
 */
export function captureTimestamp(): {
  iso: string;
  monotonicMs: number;
} {
  return {
    iso: new Date().toISOString(),
    monotonicMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
  };
}

/**
 * Computes all race results with tie-breaking and rank calculation
 */
export function calculateRaceResults(
  participants: Participant[] = [],
  timingRecords: TimingRecord[] = [],
  shootingResults: ShootingResult[] = [],
  categories: Category[] = [],
  waves: Wave[] = [],
  profiles: RaceProfile[] = [],
  penaltySecondsPerMissDefault = 20
): RaceResult[] {
  const categoryMap = new Map((categories || []).map((c) => [c.id, c]));
  const waveMap = new Map((waves || []).map((w) => [w.id, w]));
  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  // Active start records per bib
  const startMap = new Map<number, TimingRecord>();
  const finishMap = new Map<number, TimingRecord>();

  // Filter out reversed/undone records
  timingRecords
    .filter((tr) => !tr.isReversed)
    .forEach((tr) => {
      if (tr.type === 'START') {
        // Earliest start
        const existing = startMap.get(tr.bibNumber);
        if (!existing || new Date(tr.timestamp).getTime() < new Date(existing.timestamp).getTime()) {
          startMap.set(tr.bibNumber, tr);
        }
      } else if (tr.type === 'FINISH') {
        // Earliest finish
        const existing = finishMap.get(tr.bibNumber);
        if (!existing || new Date(tr.timestamp).getTime() < new Date(existing.timestamp).getTime()) {
          finishMap.set(tr.bibNumber, tr);
        }
      }
    });

  // Group shooting results by participant id
  const shootingMap = new Map<string, ShootingResult[]>();
  const shooting = effectiveShooting(shootingResults);
  shooting.effective.forEach((sr) => {
    const list = shootingMap.get(sr.participantId) || [];
    list.push(sr);
    shootingMap.set(sr.participantId, list);
  });

  const computed: RaceResult[] = participants.map((p) => {
    const cat = categoryMap.get(p.categoryId);
    const wave = p.waveId ? waveMap.get(p.waveId) : undefined;
    const profile = profileMap.get(p.raceProfileId);
    const penaltyPerMiss = profile?.penaltySecondsPerMiss ?? penaltySecondsPerMissDefault;

    const startRecord = p.bibNumber ? startMap.get(p.bibNumber) : undefined;
    const finishRecord = p.bibNumber ? finishMap.get(p.bibNumber) : undefined;

    const participantShooting = (shootingMap.get(p.id) || [])
      .sort((a, b) => a.round - b.round);

    const totalMisses = participantShooting.reduce((acc, curr) => acc + curr.misses, 0);
    const penalties = participantShooting.map(sr => shootingPenalty(profile, sr.round, sr.misses, penaltyPerMiss));
    const penaltySeconds = penalties.reduce((sum, p) => sum + p.seconds, 0);
    const penaltyLaps = penalties.reduce((sum, p) => sum + p.laps, 0);
    const expectedRounds = profile?.legs.filter(leg => leg.type === 'SHOOT') ?? [];
    const missingRounds = expectedRounds.some((leg, index) => !participantShooting.some(sr => sr.round === index + 1));
    const resultIssues: string[] = [];
    if (!profile) resultIssues.push('Wedstrijdprofiel ontbreekt');
    if (missingRounds) resultIssues.push('Schietbeurten ontbreken');
    if (shooting.issues.has(p.id)) resultIssues.push('Schietconflict oplossen');
    if (penaltyLaps > (p.penaltyLapsCompleted ?? 0)) resultIssues.push('Strafrondes nog niet bevestigd');
    if (participantShooting.some(sr => !expectedRounds[sr.round - 1] || sr.shots !== (expectedRounds[sr.round - 1].shotCount ?? 5) || sr.hits + sr.misses !== sr.shots)) resultIssues.push('Schietgegevens wijken af van profiel');
    const ownTiming = timingRecords.filter(tr => !tr.isReversed && tr.bibNumber === p.bibNumber);
    if (['START', 'FINISH'].some(type => ownTiming.filter(tr => tr.type === type).length > 1)) resultIssues.push('Tijdconflict oplossen');
    if (ownTiming.some(tr => tr.isConfirmed === false)) resultIssues.push('Tijdregistratie nog niet bevestigd');

    let rawElapsedMs: number | undefined = undefined;
    let officialTimeMs: number | undefined = undefined;

    if (startRecord && finishRecord) {
      const startMs = new Date(startRecord.timestamp).getTime();
      const finishMs = new Date(finishRecord.timestamp).getTime();
      if (finishMs >= startMs) {
        rawElapsedMs = finishMs - startMs;
        officialTimeMs = rawElapsedMs + penaltySeconds * 1000;
      }
    }

    const shootingRounds = participantShooting.map((sr) => ({
      id: sr.id,
      round: sr.round,
      shots: sr.shots ?? 5,
      hits: sr.hits,
      misses: sr.misses,
      timestamp: sr.timestamp,
      station: sr.station,
    }));

    return {
      participantId: p.id,
      bibNumber: p.bibNumber || 0,
      name: `${p.firstName} ${p.lastName}`.trim(),
      categoryName: cat?.name || 'Onbekend',
      categoryId: p.categoryId,
      raceProfileId: profile?.id ?? '',
      raceProfileName: profile?.name ?? 'Nog niet gekoppeld',
      waveName: wave?.name || 'Geen wave',
      waveId: p.waveId,
      gender: p.gender || 'X',
      club: p.club,
      team: p.team,
      status: p.status,
      statusReason: p.statusReason,
      startTime: startRecord?.timestamp,
      finishTime: finishRecord?.timestamp,
      rawElapsedTimeMs: rawElapsedMs,
      rawElapsedFormatted: rawElapsedMs !== undefined ? formatDuration(rawElapsedMs, false, false) : '--:--',
      shootingRounds,
      totalMisses,
      penaltySeconds,
      penaltyLaps,
      resultIssues,
      penaltyFormatted: penaltySeconds > 0 ? `+${penaltySeconds}s` : '0s',
      officialTimeMs,
      officialTimeFormatted: officialTimeMs !== undefined ? formatDuration(officialTimeMs, false, true) : '--:--',
      isPendingShooting: missingRounds,
    };
  });

  // Ranking overall (only participants with official finish and officialTimeMs)
  const finishers = computed.filter(
    (r) => r.officialTimeMs !== undefined && r.status === 'FINISHED' && !!r.raceProfileId && !r.resultIssues?.length
  );

  // Tie breaking rules:
  // 1. Official time (ascending)
  // 2. Fewer misses (ascending)
  // 3. Raw elapsed time (ascending)
  // 4. Finish timestamp (ascending)
  finishers.sort((a, b) => {
    if (a.officialTimeMs! !== b.officialTimeMs!) {
      return a.officialTimeMs! - b.officialTimeMs!;
    }
    if (a.totalMisses !== b.totalMisses) {
      return a.totalMisses - b.totalMisses;
    }
    if (a.rawElapsedTimeMs! !== b.rawElapsedTimeMs!) {
      return a.rawElapsedTimeMs! - b.rawElapsedTimeMs!;
    }
    const aFin = new Date(a.finishTime!).getTime();
    const bFin = new Date(b.finishTime!).getTime();
    return aFin - bFin;
  });

  // Each course has an independent overall ranking and winner.
  const profileGroups = new Map<string, RaceResult[]>();
  finishers.forEach(item => {
    const group = profileGroups.get(item.raceProfileId!) ?? [];
    group.push(item);
    profileGroups.set(item.raceProfileId!, group);
  });
  profileGroups.forEach(group => group.forEach((item, idx) => {
    item.rankOverall = idx + 1;
    item.gapMs = item.officialTimeMs! - group[0].officialTimeMs!;
    item.gapFormatted = `+${formatDuration(item.gapMs, true, false)}`;
  }));

  // Rank per category
  const categoryGroups = new Map<string, RaceResult[]>();
  finishers.forEach((item) => {
    const list = categoryGroups.get(JSON.stringify([item.raceProfileId, item.categoryId])) || [];
    list.push(item);
    categoryGroups.set(JSON.stringify([item.raceProfileId, item.categoryId]), list);
  });

  categoryGroups.forEach((group) => {
    group.forEach((item, idx) => {
      item.rankCategory = idx + 1;
    });
  });

  // Rank per gender
  const genderGroups = new Map<string, RaceResult[]>();
  finishers.forEach((item) => {
    const list = genderGroups.get(JSON.stringify([item.raceProfileId, item.gender])) || [];
    list.push(item);
    genderGroups.set(JSON.stringify([item.raceProfileId, item.gender]), list);
  });

  genderGroups.forEach((group) => {
    group.forEach((item, idx) => {
      item.rankGender = idx + 1;
    });
  });

  // Return full list sorted: finishers by rank, then started, then ready/registered, then DNF/DNS/DSQ
  return computed.sort((a, b) => {
    if (a.rankOverall !== undefined && b.rankOverall !== undefined) {
      return (a.raceProfileName ?? '').localeCompare(b.raceProfileName ?? '') || a.rankOverall - b.rankOverall;
    }
    if (a.rankOverall !== undefined) return -1;
    if (b.rankOverall !== undefined) return 1;

    const statusPriority: Record<string, number> = {
      STARTED: 1,
      READY: 2,
      REGISTERED: 3,
      CHECKED_IN: 4,
      DNF: 5,
      DNS: 6,
      DSQ: 7,
      FINISHED: 8,
    };
    return (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99);
  });
}
