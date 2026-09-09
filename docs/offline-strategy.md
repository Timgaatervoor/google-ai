# Offline-First Strategie

## Kernprincipe: Lokale Garantie Vóór Cloud
1. **Immediate Local Capture**:
   - Geen enkele actie (Start, Schietstand, Finish) wacht op netwerk-I/O of een cloud promise.
   - Bij finishinvoer (`128 ENTER`) wordt onmiddellijk een micro-timestamp (T1) in milliseconden geregistreerd.
   - Het record wordt opgeslagen in IndexedDB binnen < 15ms.
2. **Operations Queue**:
   - Statussen: `LOCAL_ONLY`, `QUEUED`, `SYNCING`, `SYNCED`, `CONFLICT`, `ERROR`.
   - Idempotente sync: herhaaldelijk verzenden veroorzaakt geen duplicaten via unieke `operationId`.
3. **Local Cache & Asset Preloading**:
   - PWA Service worker en offline app shell.
   - "Prepare Device for Offline Use" knop laadt alle deelnemers, profielen en waves vooraf in.
4. **Zero Data Loss Garantie**:
   - Zelfs bij abrupte herstart of browser refresh blijven alle records in IndexedDB bewaard en worden ze bij herstart automatisch gepresenteerd in het Recovery Center.
