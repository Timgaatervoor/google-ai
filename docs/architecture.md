# Run Biathlon De Haan Timing - Systeemarchitectuur

## 1. Overzicht
Het timing-systeem voor Run Biathlon De Haan is ontworpen volgens het **Offline-First & Event-Sourcing paradigma**. In de live wedstrijdomgeving aan de Belgische kust (duinen, strand, open terrein) kan de netwerkverbinding onbetrouwbaar zijn of wegvallen. De continuïteit van de tijdregistratie en schietresultaten is 100% gegarandeerd doordat elke interactie lokaal vastgelegd wordt via IndexedDB (Dexie.js) en direct via een event-operation log wordt gedistribueerd.

## 2. Lagenmodel
1. **Presentation Layer (React 19 + Tailwind CSS + Lucide Icons)**:
   - High-contrast, touch-first schermen voor mass/individual start, snelle finish, schietposten en live klassementen.
   - Numerieke optimalisatie (`inputMode="numeric"`, auto-focus, keyboard shortcuts).
2. **Timing Engine**:
   - Monotonic en wall-clock milliseconde capture (T1 capture vóór bevestiging).
   - Dynamische berekening van raw elapsed time, penalty time (per misser of strafrondes) en official time.
   - Configureerbare tie-breaking regels.
3. **Local State & Storage Layer (Dexie.js / IndexedDB)**:
   - Lokale databases voor Events, Profiles, Categories, Waves, Participants, Starts, Finishes, Shooting, Devices, Operations, AuditLogs, Snapshots.
4. **Operation & Sync Service (Event Sourcing)**:
   - Elke wijziging resulteert in een onveranderlijke `RaceOperation` met unieke UUID, timestamps en status.
   - Idempotente updates via `operationId`.
   - Multi-device broadcast via BroadcastChannel en cloud-sync queue connector.
5. **Failsafe & Multi-Device Conflict Resolver**:
   - Tijdstempelconflicten tussen operators worden niet stil overschreven maar expliciet geëscaleerd naar de Race Director.
   - Klokverschil (clock offset) monitoring.
