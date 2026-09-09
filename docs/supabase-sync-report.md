# Eindrapport Supabase-sync

## 1. Gewijzigde bestanden

| Bestanden | Verandering |
| --- | --- |
| `src/db/dexieDb.ts`, `src/db/syncJournal.ts` | Schema v4, eventeigendom, atomair journal, versies en tombstones |
| `src/services/syncService.ts`, `src/services/entitySync.ts` | Upload/pull, idempotente batches, merges, conflicten, Realtime en volledige sync |
| `src/services/operationService.ts`, `src/services/uuid.ts` | Eventfilter bij finishconflict; bestaande UUID-fallback gedeeld met journal |
| `src/services/backupService.ts`, `src/services/sampleDataService.ts` | Tombstones in snapshots, veilige expliciete reset/restore, behoud queue bij resultaatreset |
| `src/types/index.ts` | Compatibele metadata en twee entity-operationtypes |
| `src/hooks/useEventData.ts` | Reactieve Dexie-updates en filtering per event |
| `src/components/SyncDiagnostics.tsx`, `src/components/OnlineSyncSettings.tsx` | Status per onderdeel, pending, laatste sync, ids, cloudtelling en sync-knoppen |
| `src/components/SupabaseSetupGuide.tsx` | Migratie opgenomen in kopieerbare insteltekst |
| `src/components/views/WavesView.tsx` | Wave verwijderen en deelnemers ontkoppelen in één transactie |
| `supabase/migrations/202609080001_entity_sync.sql` | Additieve, herhaalbare servermigratie |
| `tests/supabase-sync.test.ts` | Twee onafhankelijke databases en transportmock; 16 nieuwe regressietests |
| `tests/event-reset.test.ts`, `tests/race-reliability.test.ts` | Bestaande tests aangepast aan upload vóór pull en de bredere queue |
| `package.json`, `package-lock.json`, `.gitignore` | Officiële Realtime-library en lokale npm-cache uitgesloten |
| `docs/supabase-sync-analysis.md`, `docs/supabase-sync.md`, `docs/supabase-setup.md`, `docs/supabase-sync-report.md` | Analyse, gebruik, herstel, installatie en dit rapport |

## 2. Lokale databasewijzigingen

Dexie 3 → 4 met `.upgrade()`, zonder wissen van bestaande data. Nieuwe tabel
`syncEntities` met versies/tombstones per event/tabel/id; eventId-indexen op
participants, raceProfiles en categories. Metadata is optioneel in de bestaande
types, zodat oudere imports en back-ups leesbaar blijven.

## 3. Supabase-tabellen en kolommen

Geen nieuwe cloudtabellen of kolommen. `race_operations` blijft de centrale log.
Nieuwe types: ENTITY_UPSERT en ENTITY_DELETED. Metadata staat in payload.record.
De migratie voegt een samengestelde index, payload/event-checkconstraint en
Realtime-publicationregistratie toe. Bestaande RLS-policies blijven staan.

## 4. Benodigde migratie

[`202609080001_entity_sync.sql`](../supabase/migrations/202609080001_entity_sync.sql)
uitvoeren op het bestaande Supabase-project. Niet uitgevoerd tegen een live
database tijdens deze implementatie.

## 5. Supabase bijwerken

Maak een JSON-back-up, voer de migratie in SQL Editor uit, werk alle laptops
bij en klik op Volledige synchronisatie. Een nieuw project heeft eerst de
bestaande basis- en reliability-SQL nodig. De ingebouwde insteltekst bevat de
uitbreiding. Volledige uitleg: [Supabase synchronisatie](supabase-sync.md).

## 6. Twee apparaten testen

Koppel B via A's koppellink; controleer hetzelfde eventId en verschillende
installatie-deviceIds. Maak op A `Wave test - 13:20`, controleer B, wijzig op B
naar 13:25 en controleer A. Verwijder de wave en refresh beide laptops: hij moet
wegblijven. Herhaal met een deelnemer en met offline wijzigingen/tijdregistraties.
Actieve tabs ontvangen wijzigingen via Realtime of de vijfsecondenpoll.

## 7. Verificatie en resterende beperkingen

- Lint en typecheck: geslaagd. De bestaande lint-opdracht is `tsc --noEmit`.
- Tests: **56 geslaagd**, inclusief de 40 bestaande tests.
- Productiebuild en PWA-generatie: geslaagd; waarschuwing voor grote JS-bundel.
- Secretcontrole: geen patronen gevonden in bronbestanden, Git-historiek en build.
- De echte Supabase-verbinding, SQL/RLS-uitvoering en twee fysieke laptops zijn
  niet getest. De integratietests gebruiken de echte syncservice met mocktransport.
- Anon-testpolicies blijven projectbreed: eventfilters zijn geen autorisatie.
  Echte eventbeveiliging vereist serverauthenticatie en passende RLS.
- Configuratieconflicten gebruiken toestel-updatedAt; afwijkende systeemklokken
  kunnen de winnaar beïnvloeden. Timingregistraties behouden hun afzonderlijke ids.
- De volledige log wordt periodiek gelezen; optimalisatie voor zeer grote logs
  kan later met een veilig servercheckpointprotocol.
- Alle toestellen moeten deze versie gebruiken. Eventinstellingen zelf blijven
  onderdeel van de bestaande koppelsnapshot; de zes gevraagde datatabellen worden
  doorlopend gesynchroniseerd. Oude harde deletes van vóór deze uitbreiding zijn
  niet achteraf te reconstrueren.
