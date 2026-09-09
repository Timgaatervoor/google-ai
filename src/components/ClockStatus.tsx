import { Clock, ChevronDown } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { syncService } from '../services/syncService';
import { syncStyles as ui } from './syncSettingsStyles';
import { raceClock } from '../services/raceClock';
export function ClockStatus({ embedded = false, compact = false }: { embedded?: boolean; compact?: boolean }) {
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const id = setInterval(() => tick(v => v + 1), 1000); return () => clearInterval(id); }, []);
  const clock = raceClock.status();
  const health = syncService.getSyncHealth();
  const details = <div className={embedded ? 'text-xs text-slate-400 space-y-3' : 'bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 space-y-1'} role="status">
    <div className="flex flex-wrap items-center gap-3"><strong className={clock.state === 'SYNCED' ? 'text-emerald-300' : 'text-amber-300'}>Centrale tijd: {clock.state === 'SYNCED' ? 'gemeten' : clock.state === 'STALE' ? 'meting verouderd — loopt lokaal door' : 'nog niet gemeten'}</strong><span className="font-mono">{new Date(raceClock.nowMs()).toLocaleTimeString('nl-BE')}</span>
      <button disabled={busy} className={embedded ? ui.secondary : 'underline disabled:opacity-50'} onClick={async () => { setBusy(true); try { await syncService.checkClockOffset(); } finally { setBusy(false); } }}>{busy ? 'Meten…' : 'Tijd opnieuw meten'}</button>
    </div>
    {clock.syncedAt && <p>Correctie toestelklok: {Math.round(clock.offsetMs)} ms · geschatte onzekerheid ±{Math.ceil(clock.uncertaintyMs!)} ms · meting {Math.floor(clock.ageMs! / 1000)} seconden geleden.</p>}
    {clock.error && <p className="text-amber-300">{clock.error}</p>}
    {health.lastError && syncService.getConfig().enabled && <p className="text-red-300">Synchronisatie: {health.lastError}</p>}
    {health.lastSyncAt && <p>Laatste gegevenssynchronisatie: {new Date(health.lastSyncAt).toLocaleTimeString('nl-BE')}</p>}
  </div>;
  if (!compact) return details;
  return <details className="group">
    <summary className={`list-none cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${clock.state === 'SYNCED' && !clock.error ? 'bg-slate-800 border-slate-700 text-emerald-300' : 'bg-slate-800 border-amber-500/40 text-amber-300'}`}>
      <Clock className="w-3.5 h-3.5" />
      <span>Centrale tijd: {clock.state === 'SYNCED' ? (clock.error ? 'hermeting mislukt' : 'gemeten') : clock.state === 'STALE' ? 'verouderd' : 'niet gemeten'}</span>
      <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition" />
      <span className="sr-only">Details tonen of verbergen</span>
    </summary>
    <div className="absolute top-full left-3 right-3 md:left-auto md:w-[32rem] mt-2 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-2 z-50">
      {details}
      <p className="px-3 pb-2 text-[10px] text-slate-500">Versie betrouwbaarheid 2026.09</p>
    </div>
  </details>;
}
