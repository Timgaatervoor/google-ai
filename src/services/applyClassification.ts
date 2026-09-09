import { db } from '../db/dexieDb';
import { classifyParticipant } from './participantClassification';
import { operationService } from './operationService';

export async function applyClassification() {
  return db.transaction('rw', [db.events, db.participants, db.categories, db.raceProfiles, db.timingRecords, db.shootingResults, db.auditLogs], async () => {
    const event = await db.events.toCollection().first();
    if (!event) throw new Error('Maak eerst een evenement met datum aan.');
    if (event.officialResultsLocked) throw new Error('De officiële uitslagen zijn vergrendeld.');
    const timings = (await db.timingRecords.toArray()).filter(r => !r.isReversed);
    const shooting = await db.shootingResults.toArray();
    const categories = await db.categories.toArray();
    const profiles = await db.raceProfiles.toArray();
    const problems: string[] = [];
    let updated = 0;
    for (const p of await db.participants.toArray()) {
      if (!p.stamhoofdItemId || p.stamhoofdInactive || !['REGISTERED', 'CHECKED_IN', 'READY'].includes(p.status)) continue;
      if (timings.some(r => r.participantId === p.id || (!!p.bibNumber && r.bibNumber === p.bibNumber)) || shooting.some(r => r.participantId === p.id)) continue;
      const assignment = classifyParticipant(p, event.date, categories, profiles);
      if (assignment.issues.length) problems.push(`${p.firstName} ${p.lastName}: ${assignment.issues.join('; ')}`);
      if (p.categoryId !== assignment.categoryId || p.raceProfileId !== assignment.raceProfileId) {
        await db.participants.update(p.id, { categoryId: assignment.categoryId, raceProfileId: assignment.raceProfileId, categoryAssignment: p.categoryAssignment ?? 'automatic', profileAssignment: p.profileAssignment ?? 'automatic', updatedAt: new Date().toISOString() });
        updated++;
      }
    }
    await operationService.logAudit('CLASSIFICATION_APPLIED', `${updated} indelingen bijgewerkt; ${problems.length} te controleren.`);
    return { updated, problems };
  });
}
