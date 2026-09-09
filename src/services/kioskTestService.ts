import type { RaceResult, Category, RaceProfile, Wave } from '../types';

export function generateKioskTestData(): {
  results: RaceResult[];
  categories: Category[];
  profiles: RaceProfile[];
  waves: Wave[];
} {
  const profiles: RaceProfile[] = [
    {
      id: 'prof-adult',
      name: 'Volwassenen (Standaard)',
      description: 'Standaard volwassenen parcours',
      legs: [
        { id: 'l1', type: 'RUN', name: 'Ronde 1', distanceMeters: 1000 },
        { id: 'l2', type: 'SHOOT', name: 'Schietronde 1 (Liggend)', stance: 'prone', shotCount: 5 },
        { id: 'l3', type: 'RUN', name: 'Ronde 2', distanceMeters: 1000 },
        { id: 'l4', type: 'SHOOT', name: 'Schietronde 2 (Staand)', stance: 'standing', shotCount: 5 },
        { id: 'l5', type: 'RUN', name: 'Ronde 3', distanceMeters: 1000 },
      ],
      penaltySecondsPerMiss: 20,
      penaltyLapsPerMiss: 1,
    },
    {
      id: 'prof-junior',
      name: 'Jeugd (Kort)',
      description: 'Kort jeugd parcours',
      legs: [
        { id: 'j1', type: 'RUN', name: 'Ronde 1', distanceMeters: 600 },
        { id: 'j2', type: 'SHOOT', name: 'Schietronde 1 (Liggend)', stance: 'prone', shotCount: 5 },
        { id: 'j3', type: 'RUN', name: 'Ronde 2', distanceMeters: 600 },
        { id: 'j4', type: 'SHOOT', name: 'Schietronde 2 (Liggend)', stance: 'prone', shotCount: 5 },
        { id: 'j5', type: 'RUN', name: 'Ronde 3', distanceMeters: 600 },
      ],
      penaltySecondsPerMiss: 15,
      penaltyLapsPerMiss: 1,
    },
    {
      id: 'prof-kids',
      name: 'Kids Mini',
      description: 'Mini parcours voor jonge deelnemers',
      legs: [
        { id: 'k1', type: 'RUN', name: 'Ronde 1', distanceMeters: 400 },
        { id: 'k2', type: 'SHOOT', name: 'Schietronde 1 (Liggend)', stance: 'prone', shotCount: 5 },
        { id: 'k3', type: 'RUN', name: 'Ronde 2', distanceMeters: 400 },
      ],
      penaltySecondsPerMiss: 10,
      penaltyLapsPerMiss: 1,
    },
  ];

  const categories: Category[] = [
    { id: 'cat-adult-m', name: 'Volwassenen Heren', code: 'VH', gender: 'M', minAge: 18, raceProfileIds: ['prof-adult'] },
    { id: 'cat-adult-f', name: 'Volwassenen Dames', code: 'VD', gender: 'F', minAge: 18, raceProfileIds: ['prof-adult'] },
    { id: 'cat-u14', name: 'U14 Cadetten', code: 'U14', gender: 'ALL', minAge: 12, maxAge: 13, raceProfileIds: ['prof-junior'] },
    { id: 'cat-u12', name: 'U12 Pupillen', code: 'U12', gender: 'ALL', minAge: 10, maxAge: 11, raceProfileIds: ['prof-junior'] },
    { id: 'cat-kids', name: 'U10 Mini Kids', code: 'U10', gender: 'ALL', minAge: 6, maxAge: 9, raceProfileIds: ['prof-kids'] },
  ];

  const waves: Wave[] = [
    { id: 'w1', eventId: 'test-event', name: 'Wave 1 (09:00)', waveNumber: 1, scheduledStartTime: '09:00:00', categoryIds: ['cat-adult-m'], maxParticipants: 20, status: 'STARTED', actualStartTime: '2026-09-08T09:00:00.000Z' },
    { id: 'w2', eventId: 'test-event', name: 'Wave 2 (09:15)', waveNumber: 2, scheduledStartTime: '09:15:00', categoryIds: ['cat-adult-f', 'cat-u14'], maxParticipants: 20, status: 'STARTED', actualStartTime: '2026-09-08T09:15:00.000Z' },
    { id: 'w3', eventId: 'test-event', name: 'Wave 3 (09:30)', waveNumber: 3, scheduledStartTime: '09:30:00', categoryIds: ['cat-u12', 'cat-kids'], maxParticipants: 20, status: 'STARTED', actualStartTime: '2026-09-08T09:30:00.000Z' },
  ];

  const belgianAthletes = [
    { name: 'Arthur De Smet', club: 'KASVO Oudenaarde', gender: 'M' as const, catId: 'cat-adult-m', profId: 'prof-adult', waveId: 'w1' },
    { name: 'Lucas Van den Bossche', club: 'DCLA Leuven', gender: 'M' as const, catId: 'cat-adult-m', profId: 'prof-adult', waveId: 'w1' },
    { name: 'Maximiliaan Claes', club: 'ROBA Betekom', gender: 'M' as const, catId: 'cat-adult-m', profId: 'prof-adult', waveId: 'w1' },
    { name: 'Ruben Verhoeven', club: 'ACHL Herentals', gender: 'M' as const, catId: 'cat-adult-m', profId: 'prof-adult', waveId: 'w1' },
    { name: 'Thomas De Backer', club: 'AVLO Lokeren', gender: 'M' as const, catId: 'cat-adult-m', profId: 'prof-adult', waveId: 'w1' },
    { name: 'Vincent Maes', club: 'VAC Vilvoorde', gender: 'M' as const, catId: 'cat-adult-m', profId: 'prof-adult', waveId: 'w1' },
    { name: 'Simon Dubois', club: 'CABW Nijvel', gender: 'M' as const, catId: 'cat-adult-m', profId: 'prof-adult', waveId: 'w1' },
    { name: 'Jonas Peeters', club: 'LYRA Lier', gender: 'M' as const, catId: 'cat-adult-m', profId: 'prof-adult', waveId: 'w1' },
    { name: 'Liam De Winter', club: 'AC Waasland', gender: 'M' as const, catId: 'cat-adult-m', profId: 'prof-adult', waveId: 'w1' },
    { name: 'Daan Hermans', club: 'AVT Genk', gender: 'M' as const, catId: 'cat-adult-m', profId: 'prof-adult', waveId: 'w1' },
    { name: 'Wout Van Aert', club: 'Kempen Biathlon', gender: 'M' as const, catId: 'cat-adult-m', profId: 'prof-adult', waveId: 'w1' },
    { name: 'Kobe Goossens', club: 'RC Gent', gender: 'M' as const, catId: 'cat-adult-m', profId: 'prof-adult', waveId: 'w1' },

    { name: 'Emma Vermeulen', club: 'OEH Halle', gender: 'F' as const, catId: 'cat-adult-f', profId: 'prof-adult', waveId: 'w2' },
    { name: 'Lotte Wouters', club: 'ATAC Turnhout', gender: 'F' as const, catId: 'cat-adult-f', profId: 'prof-adult', waveId: 'w2' },
    { name: 'Noor Hendrickx', club: 'AVZK Zuiderkempen', gender: 'F' as const, catId: 'cat-adult-f', profId: 'prof-adult', waveId: 'w2' },
    { name: 'Camille Devos', club: 'KAAG Gent', gender: 'F' as const, catId: 'cat-adult-f', profId: 'prof-adult', waveId: 'w2' },
    { name: 'Julie Jacobs', club: 'FLAC Roeselare', gender: 'F' as const, catId: 'cat-adult-f', profId: 'prof-adult', waveId: 'w2' },
    { name: 'Elena Van Damme', club: 'EA Aalst', gender: 'F' as const, catId: 'cat-adult-f', profId: 'prof-adult', waveId: 'w2' },
    { name: 'Hanne Claes', club: 'DCLA Leuven', gender: 'F' as const, catId: 'cat-adult-f', profId: 'prof-adult', waveId: 'w2' },
    { name: 'Marie Van Dyck', club: 'VOLH Beveren', gender: 'F' as const, catId: 'cat-adult-f', profId: 'prof-adult', waveId: 'w2' },

    { name: 'Victor Pauwels', club: 'DCLA Leuven', gender: 'M' as const, catId: 'cat-u14', profId: 'prof-junior', waveId: 'w2' },
    { name: 'Mats Vandenbroeck', club: 'ROBA Betekom', gender: 'M' as const, catId: 'cat-u14', profId: 'prof-junior', waveId: 'w2' },
    { name: 'Stan De Cock', club: 'AVLO Lokeren', gender: 'M' as const, catId: 'cat-u14', profId: 'prof-junior', waveId: 'w2' },
    { name: 'Lars Willems', club: 'ACHL Herentals', gender: 'M' as const, catId: 'cat-u14', profId: 'prof-junior', waveId: 'w2' },
    { name: 'Finn Martens', club: 'VAC Vilvoorde', gender: 'M' as const, catId: 'cat-u14', profId: 'prof-junior', waveId: 'w2' },
    { name: 'Axel De Clercq', club: 'RC Gent', gender: 'M' as const, catId: 'cat-u14', profId: 'prof-junior', waveId: 'w2' },

    { name: 'Milan Van Hoof', club: 'LYRA Lier', gender: 'M' as const, catId: 'cat-u12', profId: 'prof-junior', waveId: 'w3' },
    { name: 'Jules Lambert', club: 'CABW Nijvel', gender: 'M' as const, catId: 'cat-u12', profId: 'prof-junior', waveId: 'w3' },
    { name: 'Senne Segers', club: 'ATAC Turnhout', gender: 'M' as const, catId: 'cat-u12', profId: 'prof-junior', waveId: 'w3' },
    { name: 'Emiel De Boeck', club: 'EA Aalst', gender: 'M' as const, catId: 'cat-u12', profId: 'prof-junior', waveId: 'w3' },

    { name: 'Robin Claes', club: 'KASVO Oudenaarde', gender: 'M' as const, catId: 'cat-kids', profId: 'prof-kids', waveId: 'w3' },
    { name: 'Tibo De Wilde', club: 'AVZK', gender: 'M' as const, catId: 'cat-kids', profId: 'prof-kids', waveId: 'w3' },
    { name: 'Eline Meert', club: 'OEH Halle', gender: 'F' as const, catId: 'cat-kids', profId: 'prof-kids', waveId: 'w3' },
    { name: 'Elise Hermans', club: 'AVT Genk', gender: 'F' as const, catId: 'cat-kids', profId: 'prof-kids', waveId: 'w3' },
  ];

  const results: RaceResult[] = belgianAthletes.map((ath, idx) => {
    const bibNumber = 101 + idx;
    const cat = categories.find((c) => c.id === ath.catId)!;
    const prof = profiles.find((p) => p.id === ath.profId)!;
    const wave = waves.find((w) => w.id === ath.waveId)!;
    const shootingCount = prof.legs.filter((l) => l.type === 'SHOOT').length;

    // Realistic base times & misses
    const miss1 = idx === 0 ? 0 : idx % 3 === 0 ? 0 : 1;
    const miss2 = shootingCount > 1 ? (idx === 1 ? 0 : idx % 2 === 0 ? 1 : 2) : 0;
    const totalMisses = miss1 + (shootingCount > 1 ? miss2 : 0);
    const penaltySeconds = totalMisses * prof.penaltySecondsPerMiss;
    const penaltyMs = penaltySeconds * 1000;

    const baseElapsedSec =
      prof.id === 'prof-adult' ? 900 + idx * 42 : prof.id === 'prof-junior' ? 620 + idx * 35 : 420 + idx * 28;
    const rawElapsedMs = baseElapsedSec * 1000;
    const officialTimeMs = rawElapsedMs + penaltyMs;

    const formatTime = (ms: number) => {
      const totalSec = Math.floor(ms / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      const dec = Math.floor((ms % 1000) / 100);
      return `${m}:${s < 10 ? '0' : ''}${s}.${dec}`;
    };

    const shootingRounds = [
      { round: 1, hits: 5 - miss1, misses: miss1, shots: 5, timestamp: '09:05:00.000', station: 'BAAN-01' },
    ];
    if (shootingCount > 1) {
      shootingRounds.push({ round: 2, hits: 5 - miss2, misses: miss2, shots: 5, timestamp: '09:12:00.000', station: 'BAAN-02' });
    }

    return {
      participantId: `test-p-${idx}`,
      bibNumber,
      name: ath.name,
      club: ath.club,
      gender: ath.gender,
      categoryId: cat.id,
      categoryName: cat.name,
      raceProfileId: prof.id,
      raceProfileName: prof.name,
      waveId: wave.id,
      waveName: wave.name,
      status: 'FINISHED',
      startTime: '09:00:00.000',
      finishTime: '09:18:45.000',
      rawElapsedTimeMs: rawElapsedMs,
      rawElapsedFormatted: formatTime(rawElapsedMs),
      shootingRounds,
      totalMisses,
      penaltySeconds,
      penaltyFormatted: totalMisses > 0 ? `+${penaltySeconds}s` : '-',
      officialTimeMs,
      officialTimeFormatted: formatTime(officialTimeMs),
      rankOverall: idx + 1,
      rankCategory: idx + 1,
      gapMs: idx === 0 ? 0 : 35000 * idx,
      gapFormatted: idx === 0 ? '-' : `+${formatTime(35000 * idx)}`,
    };
  });

  return { results, categories, profiles, waves };
}
