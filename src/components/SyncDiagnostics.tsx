import { useEffect, useState } from 'react';
import { syncService } from '../services/syncService';
import { syncStyles as ui } from './syncSettingsStyles';

const labels = { participants: 'Participants', waves: 'Waves', raceProfiles: 'Race profiles', categories: 'Categories', timingRecords: 'Timing records', shootingResults: 'Shooting results' };
export function SyncDiagnostics() {
  const [health, setHealth] = useState(syncService.getSyncHealth());
  const [pending, setPending] = useState(0);
  const [parts, setParts] = useState<Awaited<ReturnType<typeof syncService.getDiagnostics>>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const [count, diagnostics] = await Promise.all([syncService.getPendingCount(), syncService.getDiagnostics()]);
      if (active) { setHealth(syncService.getSyncHealth()); setPending(count); setParts(diagnostics); }
    };
    void refresh();
    const unsubscribe = syncService.subscribe(() => { void refresh(); });
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => { active = false; unsubscribe(); clearInterval(timer); };
  }, []);
  const run = async (full: boolean) => {
    setBusy(true);
    try { const result = await (full ? syncService.fullSync() : syncService.syncNow()); setMessage(result.error || `Synchronisatie voltooid: ${result.syncedCount} wijzigingen verwerkt.`); }
    finally { setBusy(false); }
  };
  const config = syncService.getConfig();
  const offline = syncService.getIsSimulatedOffline() || !navigator.onLine;
  return <section className={ui.card}>
    <h3 className={ui.heading}>Supabase synchronisatie</h3>
    <p role="status">Status: {!config.enabled ? 'uitgeschakeld' : offline ? 'offline' : health.syncing ? 'synchroniseren' : health.lastError ? 'fout' : health.lastSyncAt ? 'verbonden' : 'nog niet gesynchroniseerd'}</p>
    <div className="grid gap-2 sm:grid-cols-2">{parts.map(part => <p key={part.table}>{labels[part.table]}: {part.pending ? `${part.pending} pending` : health.lastError ? 'controle mislukt' : health.lastSyncAt ? 'OK' : 'nog niet gecontroleerd'}</p>)}</div>
    <p>Pending operations: {pending} · Cloudrecords (operations): {health.cloudRecords}</p>
    <p>Laatste succesvolle sync: {health.lastSyncAt ? new Date(health.lastSyncAt).toLocaleString('nl-BE') : '—'}</p>
    <p>Realtime: {health.realtime}</p>
    <p className="break-all">DeviceId: {health.deviceId}<br />EventId: {config.eventId || '—'}</p>
    <div className="flex flex-wrap gap-3">
      <button className={ui.primary} disabled={busy || health.syncing || !config.enabled} onClick={() => void run(false)}>Nu synchroniseren</button>
      <button className={ui.secondary} disabled={busy || health.syncing || !config.enabled} onClick={() => void run(true)}>Volledige synchronisatie</button>
    </div>
    <p className="text-slate-400">Volledige synchronisatie uploadt lokale wijzigingen en voegt de volledige cloudhistoriek samen. Lokale wedstrijddata blijft bewaard.</p>
    {(message || health.lastError) && <p role="status">{message || health.lastError}</p>}
  </section>;
}
