# Supabase online synchronisatie

Voor het delen van waves, deelnemers en overige wedstrijddata: voer na deze
basisinstallatie de migratie uit en volg [Supabase synchronisatie](supabase-sync.md).

Voor centrale tijd en het toevoegen van extra pc's via een eenmalige koppellink: volg na de basisinstallatie [Centrale tijd en extra pc's](reliability.md) en voer de aanvullende SQL uit.

## 1. Maak een gratis project

Maak een project aan op https://supabase.com. Gebruik in de app de **Project URL** en de **anon public key** uit `Project Settings > API`.

Gebruik nooit de `service_role` key in de browser.

## 2. Maak de operations-tabel

Voer dit uit in de Supabase SQL Editor:

```sql
create table if not exists public.race_operations (
  operation_id text primary key,
  event_id text not null,
  participant_id text,
  type text not null,
  device_id text not null,
  operator_id text not null,
  device_timestamp timestamptz not null,
  server_timestamp timestamptz,
  payload jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists race_operations_event_id_idx
  on public.race_operations (event_id, device_timestamp);
```

## 3. Beveiliging voor een eerste test

Voor een eerste test kan de tabel tijdelijk lees- en schrijfbaar zijn voor de anon key:

```sql
alter table public.race_operations enable row level security;

create policy "race operations insert for anon"
  on public.race_operations for insert
  to anon
  with check (true);

create policy "race operations read for anon"
  on public.race_operations for select
  to anon
  using (true);

create policy "race operations update for anon"
  on public.race_operations for update
  to anon
  using (true)
  with check (true);
```

Voor productie moet dit worden beperkt met Supabase Auth en een event-/organisatiecontrole. Publiceren met alleen de anon key zonder RLS-beperkingen maakt de data openbaar wijzigbaar.

## 4. Registreer de app

Open **Instellingen > Online Synchronisatie** en vul in:

- Supabase Project URL
- Supabase anon public key
- Event-ID van het huidige evenement (getoond in de instellingen)

- Schakel online synchronisatie in

Klik eerst op **Verbinding testen** en daarna op **Instellingen opslaan**.

De racegegevens blijven lokaal in IndexedDB. De knop voor synchroniseren uploadt de lokale `RaceOperation`-records naar Supabase. De unieke `operation_id` voorkomt dubbele records.

### Volledig nieuw evenement

**Blanco evenement starten** wist lokale wedstrijdgegevens, de operatiewachtrij en alle auditlogs. Het logboek begint leeg, ook zonder resetmelding. Bestaande backups blijven beschikbaar.

Elk blanco evenement krijgt een nieuw, uniek ID. Supabase-synchronisatie wordt bij deze actie uitgezet en het ingestelde Event-ID wordt vervangen door het nieuwe ID; de projectverbinding blijft bewaard. Oude Supabase-gegevens worden niet verwijderd en kunnen niet terugkomen via een vertraagd antwoord van de oude synchronisatie.

De Supabase-database hoeft dus niet leeg voor een nieuwe wedstrijd. Gebruik op de andere toestellen dezelfde evenementbackup, controleer dat alle toestellen hetzelfde nieuwe Event-ID hebben en schakel daarna synchronisatie weer in. Oude testdata kan indien gewenst afzonderlijk per evenement worden opgeruimd in Supabase; daarvoor is geen algemene wisfunctie in de app nodig.
## Meerdere pc's gebruiken

Open op elke pc dezelfde online app en vul exact dezelfde Supabase Project URL, publishable/anon key en Event-ID in. Geef elke pc in **Instellingen > Algemeen & Tijd** een unieke Device ID, bijvoorbeeld `START-01`, `SHOOT-01` en `FINISH-01`.

De app synchroniseert daarna automatisch ongeveer elke vijf seconden. Lokale acties worden geüpload en acties van andere pc's worden gedownload naar de lokale IndexedDB. De andere pc's moeten dus dezelfde deelnemers, categorieën en waves hebben voordat de wedstrijd start; timing- en schietacties worden daarna gedeeld via `race_operations`.

Laat de browserpagina open tijdens de wedstrijd. Bij tijdelijk netwerkverlies blijft elke pc lokaal werken en wordt de wachtrij later opnieuw verzonden.

## Gratis alternatief

Google Drive blijft geschikt voor handmatige JSON-back-ups, maar niet als realtime database. Gebruik Supabase voor synchronisatie en Drive eventueel voor back-ups.
