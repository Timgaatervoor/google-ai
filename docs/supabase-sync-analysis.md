# Analyse bestaande synchronisatie

De applicatie bewaart events, waves, participants, raceProfiles, categories,
timingRecords, shootingResults, operations, conflicts, auditLogs, snapshots,
devices en Stamhoofd-configuratie in Dexie (schema versie 3). Er is één actief
lokaal evenement. Participants/profielen/categorieën hebben nog geen eventId.
Startnummer (`bibNumber`) en wave-indeling (`waveId`) staan op participants.
Waves gebruiken `name`, `waveNumber`, `scheduledStartTime`, `actualStartTime`,
`categoryIds`, `assignmentGroup` en `status`; profielen worden via categorieën,
assignmentGroup en deelnemers gekoppeld.

Supabase wordt rechtstreeks via fetch/PostgREST aangesproken. `race_operations`
ontvangt timing-, shooting-, undo-, status-, bib- en enkele participant-operations.
De huidige pull maakt geen waves, profielen, categorieën of volledige deelnemers.
Stamhoofd, Excel, editors en planning schrijven rechtstreeks in Dexie. Daardoor
dekt instrumentatie van alleen operationService niet alle mutaties.

Risico's: ontbrekende configuratie; harde lokale deletes zonder cloud-tombstone;
patches overschrijven nieuwere participant-data; eventloze entiteiten; gedeelde
standaard deviceId FINISH-01; pull vóór upload; geen realtime; volledige log-pull
elke vijf seconden. Timing gebruikt UUID-records en operations, bewaart conflicten
en undo. De queue blijft lokaal tot een succesvolle HTTP-write. Pull controleert
eventId en beschermt tegen een reset tijdens een lopend verzoek. UI pollt Dexie.
AuditLogs zijn lokaal; koppeling deelt een snapshot, geen doorlopende configuratie.

Keuze: één append-only operation-log behouden. Voeg ENTITY_UPSERT/ENTITY_DELETED
toe en registreer de zes tabellen atomair op Dexie-opslagniveau. Bewaar lokale
versies/tombstones apart, zodat bestaande UI harde lokale verwijderingen kan
blijven gebruiken. Gebruik deterministische versies en permanente tombstones per
record-id. Oude data krijgt een conservatieve baseline; timing-UUID's blijven
behouden. Realtime wekt dezelfde pull, met periodieke volledige log-reconciliatie
als vangnet. Geen automatische lokale reset bij cloud-sync.

RLS: de bestaande test-SQL geeft anon SELECT/INSERT/UPDATE voor alle events.
Een clientfilter is geen autorisatiegrens. Behoud bestaande policies; echte
event-autorisatie vereist gebruikers of event-credentials op de server.
