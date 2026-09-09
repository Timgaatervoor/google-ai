# Database Schema & Data Model

## Entiteiten & Collecties
- **events**: Event configuratie, status (DRAFT -> PREPARATION -> READY -> LIVE -> PAUSED -> FINISHED -> ARCHIVED).
- **raceProfiles**: Parcours configuratie (RUN legs, SHOOT legs, PENALTY regels).
- **categories**: Leeftijdscategorieën (U8, U10, U12, U14, enz.) met `raceProfileIds`, een lijst van alle toegestane wedstrijdprofielen. `raceProfileId` blijft als standaardprofiel aanwezig voor oudere back-ups.
- **waves**: Startwaves met scheduledTime, actualStartTime, maxParticipants.
- **participants**: Deelnemers (bibNumber, externalId, namen, club, status, waveId, etc.).
- **timingRecords**: Start en finish records (timestamp, monotonicMs, type: START / FINISH).
- **shootingResults**: Schietbeurten per ronde (round, hits, misses, targetStatuses).
- **operations**: Onveranderlijke event log van elke live wedstrijdactie.
- **devices**: Geregistreerde apparaten (FINISH-01, START-01, SHOOTING-A, etc.).
- **auditLogs**: Volledige geschiedenis van wijzigingen, correcties, undo's en redenen.
- **snapshots**: Periodieke 5-minuten snapshots met SHA-256 integriteitscontrole.
