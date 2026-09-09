import { db } from '../db/dexieDb';
import { generateUUID, operationService } from './operationService';
import type { TimingRecord, ShootingResult } from '../types';

export async function simulateRace(
  progressCallback?: (step: string, percent: number) => void
): Promise<void> {
  const event = await db.events.toCollection().first();
  if (!event) return;

  const participants = await db.participants.toArray();
  if (participants.length === 0) return;

  const waves = await db.waves.toArray();
  const waveMap = new Map(waves.map((w) => [w.id, w]));

  const baseStart = new Date('2026-09-19T09:00:00.000Z').getTime();

  progressCallback?.('Bestaande data resetten...', 5);
  await db.timingRecords.clear();
  await db.shootingResults.clear();

  progressCallback?.('Startwaves simuleren...', 15);

  // 1. Starts per wave
  const startRecords: TimingRecord[] = [];
  const startOps = [];

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    if (!p.bibNumber) continue;

    const wave = p.waveId ? waveMap.get(p.waveId) : undefined;
    const waveOffsetMs = ((wave?.waveNumber || 1) - 1) * 12 * 60 * 1000;
    const startMs = baseStart + waveOffsetMs + (i % 5) * 500; // slight spread
    const startIso = new Date(startMs).toISOString();

    const startRec: TimingRecord = {
      id: generateUUID(),
      eventId: event.id,
      participantId: p.id,
      bibNumber: p.bibNumber,
      type: 'START',
      timestamp: startIso,
      monotonicMs: startMs,
      clockOffsetMs: 0,
      deviceId: 'START-01',
      operatorId: 'SimulatedStart',
      isConfirmed: true,
      syncStatus: 'LOCAL_ONLY',
    };
    startRecords.push(startRec);
  }

  await db.timingRecords.bulkPut(startRecords);

  progressCallback?.('Schietbeurten simuleren...', 45);

  // 2. Shooting 1 and 2
  const shootingResults: ShootingResult[] = [];
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    if (!p.bibNumber) continue;
    const startRec = startRecords[i];
    const startMs = new Date(startRec.timestamp).getTime();

    // Shooting 1: ~7 to 15 mins after start
    const shoot1Ms = startMs + (7 + (i % 8)) * 60 * 1000;
    const rand1 = Math.random();
    let misses1 = 0;
    if (rand1 > 0.85) misses1 = 3;
    else if (rand1 > 0.65) misses1 = 2;
    else if (rand1 > 0.35) misses1 = 1;
    const hits1 = 5 - misses1;

    shootingResults.push({
      id: generateUUID(),
      eventId: event.id,
      participantId: p.id,
      bibNumber: p.bibNumber,
      round: 1,
      station: `Stand ${(i % 12) + 1}`,
      timestamp: new Date(shoot1Ms).toISOString(),
      shots: 5,
      hits: hits1,
      misses: misses1,
      operatorId: 'SimShootingA',
      deviceId: 'SHOOTING-A',
      syncStatus: 'LOCAL_ONLY',
    });

    // Shooting 2: ~16 to 28 mins after start
    const shoot2Ms = startMs + (16 + (i % 12)) * 60 * 1000;
    const rand2 = Math.random();
    let misses2 = 0;
    if (rand2 > 0.88) misses2 = 4;
    else if (rand2 > 0.70) misses2 = 2;
    else if (rand2 > 0.40) misses2 = 1;
    const hits2 = 5 - misses2;

    shootingResults.push({
      id: generateUUID(),
      eventId: event.id,
      participantId: p.id,
      bibNumber: p.bibNumber,
      round: 2,
      station: `Stand ${(i % 12) + 1}`,
      timestamp: new Date(shoot2Ms).toISOString(),
      shots: 5,
      hits: hits2,
      misses: misses2,
      operatorId: 'SimShootingB',
      deviceId: 'SHOOTING-B',
      syncStatus: 'LOCAL_ONLY',
    });
  }

  await db.shootingResults.bulkPut(shootingResults);

  progressCallback?.('Finishregistraties genereren...', 80);

  // 3. Finishes: ~25 to 50 mins after start
  const finishRecords: TimingRecord[] = [];
  const updatedParticipants = [];

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    if (!p.bibNumber) continue;

    // Simulate 2 DNF and 1 DNS
    if (i === 15) {
      updatedParticipants.push({ ...p, status: 'DNS' as const, statusReason: 'Niet opgedaagd bij start' });
      continue;
    }
    if (i === 42 || i === 88) {
      updatedParticipants.push({ ...p, status: 'DNF' as const, statusReason: 'Uitgevallen met kramp' });
      continue;
    }

    const startRec = startRecords[i];
    const startMs = new Date(startRec.timestamp).getTime();
    // Finish time spread based on category and random fitness
    const runDurationMs = (24 * 60 + ((i * 19) % (25 * 60))) * 1000 + (i * 1234) % 1000;
    const finishMs = startMs + runDurationMs;

    finishRecords.push({
      id: generateUUID(),
      eventId: event.id,
      participantId: p.id,
      bibNumber: p.bibNumber,
      type: 'FINISH',
      timestamp: new Date(finishMs).toISOString(),
      monotonicMs: finishMs,
      clockOffsetMs: 0,
      deviceId: 'FINISH-01',
      operatorId: 'SimFinish',
      isConfirmed: true,
      syncStatus: 'LOCAL_ONLY',
    });

    updatedParticipants.push({ ...p, status: 'FINISHED' as const });
  }

  await db.timingRecords.bulkPut(finishRecords);
  await db.participants.bulkPut(updatedParticipants);

  await operationService.logAudit(
    'SIMULATION_COMPLETED',
    `Simulatie voltooid: ${finishRecords.length} finishes, ${shootingResults.length} schietbeurten, 2 DNF, 1 DNS`
  );

  progressCallback?.('Voltooid! Resultaten berekend.', 100);
}
