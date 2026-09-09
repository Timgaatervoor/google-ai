# Backup & Disaster Recovery

## 4 Lagen Bescherming
1. **Laag 1 - IndexedDB Lokaal**: Directe persistente opslag in de browser via Dexie.js. Blijft bewaard na tab/browser herstart.
2. **Laag 2 - Cloud Database & Sync Queue**: Idempotente synchronisatie naar Firestore / Cloud REST API wanneer verbinding beschikbaar is.
3. **Laag 3 - Automatische Snapshots**: Elke 5 minuten tijdens een LIVE wedstrijd wordt een volledige staat-snapshot gemaakt inclusief SHA-256 integriteits-hash.
4. **Laag 4 - Exportbestand & Papieren Noodmodus**:
   - Directe download van JSON/CSV backupbestanden.
   - Nood-startlijst (PDF/HTML) voor handmatige pen-en-papier registratie indien alle apparaten zouden uitvallen.

## Herstelprocedure (Recovery Center)
- Bij het opstarten controleert de applicatie direct of er niet-gesynchroniseerde lokale data aanwezig is.
- JSON-backups kunnen op elk apparaat worden geïmporteerd met een interactieve diff-controle vóór definitief herstel.
