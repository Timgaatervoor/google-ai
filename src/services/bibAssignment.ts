import type { Participant } from '../types';
import { db } from '../db/dexieDb';
import { competitionAge } from './participantClassification';
import { operationService } from './operationService';

export interface BibAgeRange { minAge: number; maxAge: number; firstBib: number; lastBib: number }
export interface BibChange { participantId: string; name: string; age?: number; oldBib?: number; bibNumber?: number }

export function planAgeBibs(participants: Participant[], eventDate: string, ranges: BibAgeRange[], onlyMissing: boolean): BibChange[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate ?? '')) throw new Error('Stel eerst een geldige evenementdatum in.');
  if (!ranges.length) throw new Error('Voeg minstens één leeftijdsbereik toe.');
  ranges.forEach((range, index) => {
    if (!Object.values(range).every(Number.isSafeInteger) || range.minAge < 0 || range.maxAge < range.minAge || range.firstBib < 1 || range.lastBib < range.firstBib) throw new Error(`Bereik ${index + 1}: controleer de leeftijden en borstnummers.`);
    for (const other of ranges.slice(0, index)) {
      if (range.minAge <= other.maxAge && other.minAge <= range.maxAge) throw new Error('Leeftijdsbereiken mogen niet overlappen.');
      if (range.firstBib <= other.lastBib && other.firstBib <= range.lastBib) throw new Error('Borstnummerbereiken mogen niet overlappen.');
    }
  });
  const groups = ranges.map(range => participants.filter(p => {
    const age = competitionAge(p.birthDate, eventDate);
    return !p.stamhoofdInactive && (!onlyMissing || !p.bibNumber) && age !== undefined && age >= range.minAge && age <= range.maxAge;
  }).sort((a, b) => a.lastName.localeCompare(b.lastName, 'nl') || a.firstName.localeCompare(b.firstName, 'nl') || a.id.localeCompare(b.id)));
  const targets = new Set(groups.flat().map(p => p.id));
  const occupied = new Set(participants.filter(p => !targets.has(p.id) && p.bibNumber).map(p => p.bibNumber!));
  return groups.flatMap((group, index) => {
    const range = ranges[index];
    let next = range.firstBib;
    return group.map(p => {
      while (occupied.has(next) && next <= range.lastBib) next++;
      if (next > range.lastBib) throw new Error(`Niet genoeg vrije borstnummers voor leeftijd ${range.minAge} t/m ${range.maxAge}. Vergroot het nummerbereik.`);
      const bibNumber = next++;
      occupied.add(bibNumber);
      return { participantId: p.id, name: `${p.firstName} ${p.lastName}`, age: competitionAge(p.birthDate, eventDate), oldBib: p.bibNumber, bibNumber };
    });
  }).filter(change => change.oldBib !== change.bibNumber);
}

export async function updateBibs(request: { clear: true } | { clear: false; ranges: BibAgeRange[]; onlyMissing: boolean; preview: BibChange[] }) {
  return db.transaction('rw', [db.events, db.participants, db.timingRecords, db.shootingResults, db.waves, db.auditLogs], async () => {
    const event = await db.events.toCollection().first();
    // Timing is also linked by bib, so bulk reuse is only safe before racing.
    if (event?.officialResultsLocked || ['LIVE', 'PAUSED', 'FINISHED', 'ARCHIVED'].includes(event?.status ?? '') ||
      await db.timingRecords.count() || await db.shootingResults.count() ||
      (await db.waves.toArray()).some(w => w.actualStartTime || w.status !== 'SCHEDULED') ||
      (await db.participants.toArray()).some(p => ['STARTED', 'FINISHED', 'DNF', 'DSQ'].includes(p.status))) {
      throw new Error('Bulknummering kan alleen vóór de wedstrijd, zonder start-, finish- of schietregistraties. Gebruik tijdens de wedstrijd de individuele borstnummercorrectie.');
    }
    const participants = await db.participants.toArray();
    const changes: BibChange[] = request.clear === true ? participants.filter(p => p.bibNumber !== undefined).map(p => ({ participantId: p.id, name: `${p.firstName} ${p.lastName}`, oldBib: p.bibNumber })) : planAgeBibs(participants, event?.date ?? '', request.ranges, request.onlyMissing);
    if (request.clear === false && JSON.stringify(changes) !== JSON.stringify(request.preview)) throw new Error('De deelnemers of nummering zijn gewijzigd. Bekijk eerst een nieuwe preview.');
    const now = new Date().toISOString();
    for (const change of changes) {
      await db.participants.update(change.participantId, { bibNumber: change.bibNumber, updatedAt: now });
    }
    await operationService.logAudit(request.clear ? 'BIBS_CLEARED' : 'BIBS_ASSIGNED_BY_AGE', JSON.stringify({ changes, eventYear: event?.date?.slice(0, 4) }));
    return changes.length;
  });
}
