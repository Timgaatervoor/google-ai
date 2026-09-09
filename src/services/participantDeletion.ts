import { db } from '../db/dexieDb';
import { operationService } from './operationService';

export type ParticipantDeleteTarget = 'participant' | 'start' | 'finish' | 'shooting';
export const deleteTargetLabels: Record<ParticipantDeleteTarget, string> = {
  participant: 'Deelnemer en alle wedstrijdregistraties', start: 'Starttijd', finish: 'Stoptijd (finish)', shooting: 'Schietproef',
};

export async function deleteParticipantData(eventId: string, participantId: string, target: ParticipantDeleteTarget, reason: string, round?: number) {
  if (!Object.hasOwn(deleteTargetLabels, target)) throw new Error('Ongeldige verwijderactie.');
  if (round !== undefined && (!Number.isSafeInteger(round) || round < 1)) throw new Error('Ongeldige schietronde.');
  return db.transaction('rw', [db.events, db.participants, db.timingRecords, db.shootingResults, db.conflicts, db.auditLogs], async () => {
    const events = await db.events.toArray();
    if (events.length !== 1 || events[0].id !== eventId) throw new Error('Het actieve evenement is gewijzigd. Open de deelnemer opnieuw.');
    if (events[0].officialResultsLocked) throw new Error('De uitslagen zijn vergrendeld. Ontgrendel ze eerst om gegevens te wissen.');
    const participant = await db.participants.get(participantId);
    if (!participant || (participant.eventId && participant.eventId !== eventId)) throw new Error('Deze deelnemer bestaat niet meer in dit evenement.');
    const belongs = (record: { eventId: string; participantId?: string; bibNumber: number }) => record.eventId === eventId &&
      (record.participantId === participantId || (!record.participantId && !!participant.bibNumber && record.bibNumber === participant.bibNumber));
    const timing = await db.timingRecords.filter(record => belongs(record) &&
      (target === 'participant' || (target === 'start' && record.type === 'START') || (target === 'finish' && record.type === 'FINISH'))).toArray();
    // Delete the whole selected round, including superseded corrections, so an older score cannot reappear.
    const shooting = await db.shootingResults.filter(record => belongs(record) &&
      (target === 'participant' || (target === 'shooting' && (round === undefined || record.round === round)))).toArray();
    await db.timingRecords.bulkDelete(timing.map(record => record.id));
    await db.shootingResults.bulkDelete(shooting.map(record => record.id));
    const removedIds = new Set([...timing, ...shooting].map(record => record.id));
    await db.conflicts.filter(c => c.eventId === eventId && (removedIds.has(c.recordA.id) || removedIds.has(c.recordB.id)))
      .modify({ resolvedWinner: 'MANUAL', resolvedAt: new Date().toISOString(), resolvedReason: 'Registratie gewist' });
    if (target === 'participant') await db.participants.delete(participantId);
    else if ((target === 'start' || target === 'finish') && !['DNS', 'DNF', 'DSQ'].includes(participant.status)) {
      const remaining = await db.timingRecords.filter(record => belongs(record) && !record.isReversed).toArray();
      await db.participants.update(participantId, { status: remaining.some(record => record.type === 'FINISH') ? 'FINISHED' : remaining.some(record => record.type === 'START') ? 'STARTED' : 'READY' });
    }
    await operationService.logAudit('PARTICIPANT_DATA_DELETED',
      `${deleteTargetLabels[target]} gewist${round ? ` (ronde ${round})` : ''}: ${timing.length} tijdregistraties, ${shooting.length} schietregistraties.`,
      participantId, participant.bibNumber, reason.trim() || 'Gewist via deelnemerdetail');
  });
}
