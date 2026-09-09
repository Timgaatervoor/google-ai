# Supabase synchronisatie

## Opslag en architectuur

IndexedDB/Dexie blijft de primaire offline opslag. Supabase bewaart één gedeeld,
append-only operation-log in `race_operations`. Er zijn geen concurrerende
cloudtabellen voor waves of deelnemers. De bestaande timingoperations blijven
ondersteund; `ENTITY_UPSERT` en `ENTITY_DELETED` delen volledige records uit
`waves`, `participants`, `raceProfiles`, `categories`, `timingRecords` en
`shootingResults`. Startnummers (`bibNumber`) en wave-toewijzingen (`waveId`)
staan op participants. Alle bestaande Wave-velden worden meegenomen, inclusief
volgorde (`waveNumber`), categorieën, assignmentGroup, geplande/werkelijke start
en status. Wedstrijdprofielen blijven via de bestaande relaties gekoppeld.

De Dexie DBCore-middleware vangt add, put, update, modify, bulkbewerkingen,
delete en clear af. Record, operation en versie worden in **dezelfde
IndexedDB-transactie** vastgelegd. Een fout in de queue breekt de transactie af.
Dit dekt ook Stamhoofd, Excel, waveplanning, bib-toewijzing en de bestaande editors.
Het volledige payload behoudt bronvelden en bestaande naming conventions.

Dexie versie 4 voegt `syncEntities` toe voor recordversies en tombstones, plus
eventId-indexen op participants/profielen/categorieën. `.upgrade()` koppelt oude
eventloze records alleen wanneer precies één evenement bestaat. De overige
tabellen en gegevens blijven behouden. Bij de eerste sync worden oude records
zonder journal als baseline toegevoegd met hun bestaande updatedAt/createdAt,
of 1970 wanneer die ontbreken. Hierdoor wordt een oude snapshot zonder
timestamps niet voorgesteld als een zojuist gedane bewerking.

## Sync flow en offline

1. Lokale wijzigingen worden onmiddellijk opgeslagen met `LOCAL_ONLY` operation.
2. Upload in batches van maximaal 200 met `on_conflict=operation_id` en
   `resolution=ignore-duplicates`. Pas na HTTP-bevestiging volgt `SYNCED`.
3. Pull de eventgebonden volledige historiek in pagina's van 500, gesorteerd op
   created_at en operation_id. Elke nieuwe operation en bijbehorende projectie
   worden atomair lokaal opgeslagen. Bekende operationIds worden overgeslagen.
4. Remote transacties onderdrukken alleen hun eigen journal; gelijktijdige lokale
   mutaties blijven geregistreerd. Geen echo-loop.
5. Dexie liveQuery vernieuwt de React-data direct; de bestaande twee-secondenpoll
   blijft een extra vangnet. Een browserrefresh is niet nodig.

Bij browserstart, een online-event en elke vijf seconden tijdens gebruik vindt
sync plaats. Een request heeft een timeout van 15 seconden. Een mislukte upload
blijft pending; bevestigde eerdere batches hoeven niet opnieuw. Bij verloren
HTTP-bevestiging kan dezelfde operation veilig opnieuw verstuurd worden.
Een gemiste of verschoven downloadpagina wordt in de volgende volledige pull
alsnog opgehaald. Deze versie gebruikt bewust geen timestampcursor die laat
gecommitteerde transacties zou kunnen missen.

`Volledige synchronisatie` uploadt ook al bevestigde lokale operations opnieuw
(idempotent, nuttig bij een lege/verplaatste cloud), downloadt en mergt de log,
en doet nog een cyclus voor edits tijdens het eerste verzoek. Geen enkele
cloud-sync wist automatisch lokale tabellen. Een lege cloud, netwerkfout of
verkeerd eventId vormt nooit een instructie om data te verwijderen.

## Realtime

De officiële `@supabase/realtime-js`-client subscribeert op INSERTs in
race_operations, gefilterd op het actieve eventId. Een melding start dezelfde
HTTP-sync. Een succesvolle (her)verbinding haalt eveneens gemiste wijzigingen
op. Configuratiewijziging sluit de oude verbinding. Ook zonder Realtime blijft
de vijfsecondenpoll werken. Achtergrondtabs kunnen door de browser vertraagd
worden; voor een actieve wedstrijd blijven de bedieningstabbladen actief.

De SQL-migratie voegt race_operations toe aan de bestaande supabase_realtime
publication als dat nog niet gebeurd is. Zie de officiële
[Supabase Postgres Changes-documentatie](https://supabase.com/docs/guides/realtime/postgres-changes).

## Conflicten en verwijderingen

Configuratie gebruikt de laatste updatedAt; bij gelijke timestamps wint de
lexicografisch grootste operationId. Lokale opvolgende edits zijn minimaal één
milliseconde nieuwer dan de bekende versie. Klokafwijkingen tussen toestellen
kunnen nog bepalen welke gelijktijdige configuratie-edit wint: controleer de
toestelklokken voor de wedstrijd. De verliezende inhoud blijft in de operation-log.

Een delete is een permanente tombstone voor `(eventId, tabel, recordId)`.
Het record verdwijnt lokaal uit de gewone tabel, de tombstone blijft in
syncEntities en in de cloud-operation. Een delete wint ook van een later
aankomende offline edit. Herstel als nieuw record vereist een nieuw UUID.
Verwijderde waves ontkoppelen deelnemers; stale toewijzingen aan een bekende
verwijderde wave worden genegeerd. Dit voorkomt terugkeer van een verwijderde
dubbele Rune na een refresh, import van oude data of replay.

Tijden en schietbeurten behouden hun afzonderlijke UUID's: verschillende
registraties van twee toestellen blijven beide bestaan. Mogelijke dubbele
starts/finishes/schietbeurten worden als conflict bewaard. Undo en correcties
blijven in de log; een undo die vóór de oorspronkelijke tijd binnenkomt wordt
toch toegepast. Een herroepen tijd wordt door een oude snapshot niet actief.
Tijdregistraties voor bewust verwijderde record-id's worden evenmin hersteld
door oudere timingoperations. Nieuwe schietcorrecties behouden supersedesIds.

## EventId, deviceId en beveiliging

De huidige applicatie ondersteunt één actief lokaal evenement. Geen eventnamen
vergelijken of handmatig verschillende events dezelfde naam geven: koppel de
tweede laptop via de bestaande koppellink zodat beide exact hetzelfde eventId
hebben. Cloudqueries filteren event_id; binnen de lokale transactie wordt opnieuw
gecontroleerd of de configuratie en het evenement nog geldig zijn. Payload-eventId
moet overeenkomen met de operation. Bij meerdere oude lokale events wordt sync
gestopt in plaats van eigendom te gokken. UI filtert eventgebonden data.

Het journal heeft een unieke installatie-UUID in localStorage
(`biathlon_sync_device_id`), zichtbaar in diagnostiek en als updatedByDeviceId.
De bestaande operator/post-deviceId van timing blijft behouden voor audit en
wedstrijdgebruik. Koppeling kopieert de installatie-UUID niet naar de andere pc.
Auditlogs blijven lokaal; de gedeelde operation-log bevat mutatiehistoriek.
Logs met `[SYNC]` tonen uploads, downloads, conflicten en Realtime-status, zonder
de Supabase-key of volledige deelnemergegevens te loggen.

De migratie behoudt bestaande RLS-policies. Ze valideert de event-consistentie
van nieuwe entity-payloads, maar **de bestaande anon-testpolicies geven toegang
tot alle evenementen van dat Supabase-project**. Eventfilters en een publieke key
zijn geen toegangsbeveiliging. De huidige app heeft geen gebruikerslogin of
event-authenticatietoken; echte event-autorisatie vereist een afzonderlijke
auth-uitbreiding en serverpolicies. Gebruik bestaande productiepolicies als die
aanwezig zijn; voer de permissieve test-setup daar niet opnieuw uit. Realtime
volgt SELECT/RLS-toegang. Zie [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Supabase bijwerken

1. Maak vóór het bijwerken een volledige JSON-back-up in de app, op beide pc's.
2. Bestaand project: voer `supabase/migrations/202609080001_entity_sync.sql` uit
   in de Supabase SQL Editor. Deze migratie is herhaalbaar en verwijdert niets.
   Ze voegt een event/created_at/operation_id-index, een payload-checkconstraint
   en de Realtime-publicationregistratie toe. Er zijn **geen nieuwe cloudtabellen
   of kolommen**; metadata staat in het bestaande JSONB-payload.
3. Nieuw testproject: volg eerst `docs/supabase-setup.md` en
   `supabase/reliability.sql`, daarna deze migratie. Instellingen > Supabase >
   insteltekst bevat nu ook deze uitbreiding.
4. Werk alle laptops bij naar deze appversie. Oude clients kennen de nieuwe
   entity-operations niet en zijn ongeschikt om tegelijk wedstrijdconfiguratie
   te bewerken. Sluit oude tabs tijdens de update.
5. Open Instellingen > Supabase, controleer eventId en klik op
   `Volledige synchronisatie`. Controleer pending 0, laatste succesvolle sync,
   onderdeelstatussen en Realtime. Cloudrecords telt operations, niet deelnemers.

## Twee laptops testen

1. Configureer Supabase op A; koppel B via de bestaande eenmalige koppellink.
   Vergelijk eventId en controleer dat de installatie-deviceIds verschillen.
2. Maak op A `Wave test - 13:20` met geplande start 13:20.
   B hoort de wave via Realtime of binnen circa vijf seconden plus netwerktijd
   te zien, zonder refresh.
3. Wijzig op B de geplande start naar 13:25. Controleer die op A.
4. Wijs op A een deelnemer met startnummer toe en controleer op B; ontkoppel en
   controleer opnieuw.
5. Verwijder de wave. Controleer beide pc's, refresh en voer volledige sync uit:
   de wave blijft weg. Herhaal dit met een dubbele testdeelnemer.
6. Zet A offline, wijzig een andere wave en registreer tijden/schietbeurten.
   Heropen eventueel de app. Pending blijft aanwezig. Herstel internet en
   controleer dat B alles ontvangt en pending naar nul gaat.
7. Registreer op beide toestellen een verschillende tijd voor hetzelfde
   startnummer: beide records blijven bestaan en het conflict kan worden beoordeeld.

## Herstel en grenzen

Bij een syncfout: behoud IndexedDB, exporteer een back-up, controleer URL, key,
eventId en SQL/RLS. Klik daarna op Nu synchroniseren of Volledige synchronisatie.
Wis nooit IndexedDB om een netwerkfout te verhelpen. Een lokaal leeg gemaakte
cloud herstelt u met volledige sync vanaf een toestel met de complete log.
Verwijder tombstones/operations niet uit die log: zij voorkomen terugkeer van data.

Nieuwe snapshots bevatten syncEntities en de operation-log. Expliciet herstel
of koppelen onderdrukt het journal tijdens vervangen van lokale tabellen; het
vervangen wordt dus niet als massale cloud-delete verstuurd. Oude snapshots
blijven leesbaar en krijgen zo nodig de conservatieve baseline. Een oude snapshot
waarin een record al hard verwijderd was vóór deze uitbreiding kan niet achteraf
bewijzen dat er een delete was; die eerdere verwijderingen moeten opnieuw worden
beoordeeld. Eventinstellingen zelf, auditlogs, devices en Stamhoofd-credentials
worden niet door dit nieuwe entity-model gesynchroniseerd; koppeling gebruikt
zoals voorheen het eventsnapshot.

De volledige log wordt iedere cyclus gelezen; bij zeer grote evenementen is later
een serversequence/checkpointprotocol wenselijk. Appends maken de historiek groter,
maar vermijden verlies door onveilige client-timestampcursors. Een teruggezette
back-up herstelt geen record met een bekende tombstone onder hetzelfde id.

## Verificatie

`tests/supabase-sync.test.ts` gebruikt twee onafhankelijke fake-indexeddb-databases
en de echte SyncService met een nagebootste PostgREST-transportlaag. Tests dekken
aanmaak/update/delete/reopen, idempotentie, offline/netwerkfouten, importbaseline,
event-isolatie, gelijktijdige conflicten, timing/schieten, transactierollback,
bulk-clear, migratie en gedeeltelijke uploads met verloren bevestiging.
De bestaande paginering-, reset-, timing-, Stamhoofd-, Excel- en planningtests
blijven actief. Een echte Supabase-server, RLS-uitvoering en twee fysieke laptops
moeten met bovenstaande stappen nog in de eigen omgeving worden gecontroleerd.
