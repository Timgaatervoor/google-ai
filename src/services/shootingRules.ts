import type { RaceProfile, ShootingResult } from '../types';

export function effectiveShooting(records: ShootingResult[]) {
  const grouped = new Map<string, ShootingResult[]>();
  for (const r of records.filter(r => !r.isCorrected)) {
    const key = JSON.stringify([r.eventId, r.participantId, r.round]);
    grouped.set(key, [...(grouped.get(key) ?? []), r]);
  }
  const issues = new Set<string>();
  const effective = [...grouped.values()].map(group => {
    const superseded = new Set(group.flatMap(r => r.supersedesIds ?? []));
    const current = group.filter(r => !superseded.has(r.id));
    // Legacy corrections have no explicit predecessor: use the latest correction.
    const corrections = current.filter(r => r.isCorrection && r.supersedesIds === undefined);
    const candidates = corrections.length ? corrections : current;
    if (current.length > 1 && !corrections.length) issues.add(group[0].participantId);
    return candidates.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id.localeCompare(a.id))[0];
  }).filter(Boolean);
  return { effective, issues };
}
export function shootingPenalty(profile: RaceProfile | undefined, round: number, misses: number, fallback = 20) {
  const leg = profile?.legs.filter(l => l.type === 'SHOOT')[round - 1];
  const type = leg?.penaltyType ?? 'time';
  const value = leg?.penaltyValueSeconds ?? profile?.penaltySecondsPerMiss ?? fallback;
  return { seconds: type === 'time' ? misses * value : type === 'fixed' && misses > 0 ? value : 0,
    laps: type === 'lap' ? misses * (leg?.penaltyLapsPerMiss ?? profile?.penaltyLapsPerMiss ?? 1) : 0 };
}
