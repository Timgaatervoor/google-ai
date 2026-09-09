import type { Participant, RaceEvent, Wave } from '../types';
import { db } from '../db/dexieDb';
import { generateUUID, operationService } from './operationService';

export type WaveSettings = NonNullable<RaceEvent['waveSettings']>;
export type WaveGrouping = 'registration' | 'article' | 'profile';
export const defaultWaveSettings: WaveSettings = { intervalMinutes: 10, capacity: 25, firstStartTime: '10:00:00' };
export function timeSeconds(value: string): number {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match || +match[1] > 23 || +match[2] > 59 || +(match[3] ?? 0) > 59) throw new Error('Gebruik een geldig startuur (uu:mm of uu:mm:ss).');
  return +match[1] * 3600 + +match[2] * 60 + +(match[3] ?? 0);
}
function timeString(seconds: number) {
  if (seconds >= 86400) throw new Error('Het tijdschema loopt voorbij middernacht. Pas startuur, interval of capaciteit aan.');
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(v => String(v).padStart(2, '0')).join(':');
}
export function validateWaveSettings(settings: WaveSettings) {
  timeSeconds(settings.firstStartTime);
  if (!Number.isSafeInteger(settings.intervalMinutes) || settings.intervalMinutes < 1 || settings.intervalMinutes > 1440 || !Number.isSafeInteger(settings.capacity) || settings.capacity < 1 || settings.capacity > 1000) throw new Error('Kies een interval van 1–1440 minuten en een capaciteit van 1–1000 deelnemers.');
}
export function nextWaveTime(waves: Wave[], settings: WaveSettings) {
  validateWaveSettings(settings);
  return timeString(waves.length ? Math.max(timeSeconds(settings.firstStartTime), Math.max(...waves.map(w => timeSeconds(w.scheduledStartTime))) + settings.intervalMinutes * 60) : timeSeconds(settings.firstStartTime));
}
export function waveGroupValue(p: Participant, mode: 'article' | 'profile') { return mode === 'article' ? p.article || String(p.stamhoofdRegistration?.product ?? '') : p.raceProfileId; }
export function waveAllows(wave: Wave, participant: Participant) {
  return (!wave.categoryIds.length || wave.categoryIds.includes(participant.categoryId)) && (!wave.assignmentGroup || waveGroupValue(participant, wave.assignmentGroup.type) === wave.assignmentGroup.value);
}
export function planWaves(eventId: string, waves: Wave[], participants: Participant[], settings: WaveSettings, grouping: WaveGrouping) {
  validateWaveSettings(settings);
  const created: Wave[] = [];
  const assignments: Array<{ participantId: string; waveId: string; name: string; registeredAt: string }> = [];
  const skipped: string[] = [];
  const available = waves.filter(w => w.eventId === eventId).map(w => ({ ...w })).sort((a, b) => timeSeconds(a.scheduledStartTime) - timeSeconds(b.scheduledStartTime) || a.waveNumber - b.waveNumber);
  const members = new Map(available.map(w => [w.id, participants.filter(p => p.waveId === w.id)]));
  const date = (p: Participant) => Number.isFinite(Date.parse(p.stamhoofdRegisteredAt ?? '')) ? p.stamhoofdRegisteredAt! : p.createdAt;
  const timestamp = (p: Participant) => Number.isFinite(Date.parse(date(p))) ? Date.parse(date(p)) : Number.MAX_SAFE_INTEGER;
  const candidates = participants.filter(p => !p.waveId && !p.stamhoofdInactive && ['REGISTERED', 'CHECKED_IN', 'READY'].includes(p.status)).sort((a, b) => timestamp(a) - timestamp(b) || a.id.localeCompare(b.id));
  for (const p of candidates) {
    if (grouping !== 'registration' && !waveGroupValue(p, grouping)) { skipped.push(`${p.firstName} ${p.lastName}: ${grouping === 'article' ? 'artikel' : 'wedstrijdprofiel'} ontbreekt`); continue; }
    let target = available.find(w => w.status === 'SCHEDULED' && !w.actualStartTime && members.get(w.id)!.length < w.maxParticipants && waveAllows(w, p) &&
      (grouping === 'registration' || members.get(w.id)!.every(other => waveGroupValue(other, grouping) === waveGroupValue(p, grouping))));
    if (!target) {
      const number = Math.max(0, ...available.map(w => w.waveNumber)) + 1;
      target = { id: `planned-${number}`, eventId, name: `Wave ${number}`, waveNumber: number, scheduledStartTime: nextWaveTime(available, settings), categoryIds: [], maxParticipants: settings.capacity, status: 'SCHEDULED', ...(grouping !== 'registration' ? { assignmentGroup: { type: grouping, value: waveGroupValue(p, grouping) } } : {}) };
      created.push(target); available.push(target); members.set(target.id, []);
    }
    members.get(target.id)!.push(p);
    assignments.push({ participantId: p.id, waveId: target.id, name: `${p.firstName} ${p.lastName}`, registeredAt: date(p) });
  }
  return { created, assignments, skipped, fallbackDates: candidates.filter(p => !Number.isFinite(Date.parse(p.stamhoofdRegisteredAt ?? ''))).length };
}
export type WavePlan = ReturnType<typeof planWaves>;
export async function applyWavePlan(settings: WaveSettings, grouping: WaveGrouping, preview: WavePlan) {
  return db.transaction('rw', [db.events, db.waves, db.participants, db.timingRecords, db.shootingResults, db.auditLogs], async () => {
    const event = await db.events.toCollection().first();
    if (!event || event.officialResultsLocked || ['FINISHED', 'ARCHIVED'].includes(event.status)) throw new Error('Dit evenement kan niet meer automatisch ingedeeld worden.');
    const people = await db.participants.toArray();
    const timings = await db.timingRecords.toArray();
    const shooting = await db.shootingResults.toArray();
    const fresh = planWaves(event.id, await db.waves.toArray(), people, settings, grouping);
    if (JSON.stringify(fresh) !== JSON.stringify(preview)) throw new Error('De indeling is intussen gewijzigd. Maak een nieuwe preview.');
    const targeted = people.filter(p => fresh.assignments.some(a => a.participantId === p.id));
    if (targeted.some(p => timings.some(t => t.participantId === p.id || (!!p.bibNumber && t.bibNumber === p.bibNumber)) || shooting.some(s => s.participantId === p.id))) throw new Error('Een geselecteerde deelnemer heeft al wedstrijdregistraties. Controleer de deelnemersstatus.');
    const ids = new Map(fresh.created.map(w => [w.id, generateUUID()]));
    for (const w of fresh.created) await db.waves.put({ ...w, id: ids.get(w.id)! });
    for (const a of fresh.assignments) await db.participants.update(a.participantId, { waveId: ids.get(a.waveId) ?? a.waveId, updatedAt: new Date().toISOString() });
    await db.events.update(event.id, { waveSettings: settings });
    await operationService.logAudit('WAVES_AUTO_ASSIGNED', `${fresh.assignments.length} deelnemers ingedeeld; ${fresh.created.length} waves aangemaakt; methode: ${grouping}.`);
    return fresh.assignments.length;
  });
}
