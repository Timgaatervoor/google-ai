import React, { useState } from 'react';
import { Cloud, Clock, Database } from 'lucide-react';
import { syncService, type SyncConfig } from '../services/syncService';
import { ClockStatus } from './ClockStatus';
import { DevicePairingPanel } from './DevicePairingPanel';
import { syncStyles as ui } from './syncSettingsStyles';
import { SupabaseSetupGuide } from './SupabaseSetupGuide';
import { SyncDiagnostics } from './SyncDiagnostics';

function connectionHelp(error?: string) {
  if (error?.includes('401')) return 'De toegangssleutel wordt niet herkend. Kopieer de volledige Publishable key opnieuw uit Supabase en plak die hieronder.';
  if (error?.includes('403')) return 'De online opslag geeft geen toegang. Laat de beheerder de toegang voor deze app controleren; gebruik geen andere of geheime sleutel.';
  if (error?.includes('404')) return 'De opslag voor wedstrijdregistraties is nog niet gevonden. Controleer het projectadres en voltooi stap B van de uitleg.';
  return 'De verbinding is niet gelukt. Controleer je internetverbinding en projectadres, en kijk of je Supabase-project actief is.' + (error ? ` Melding: ${error}` : '');
}

export function OnlineSyncSettings({ eventId, eventName, onJoined }: { eventId: string; eventName: string; onJoined: () => void }) {
  const [config, setConfig] = useState<SyncConfig>(() => ({ ...syncService.getConfig(), eventId }));
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [testing, setTesting] = useState(false);
  const [route, setRoute] = useState<'setup' | 'join'>('setup');
  const update = (changes: Partial<SyncConfig>) => { setConfig(current => ({ ...current, ...changes })); setMessage(undefined); };
  const normalized = { ...config, projectUrl: config.projectUrl.trim().replace(/\/$/, ''), anonKey: config.anonKey.trim(), eventId };
  const canConnect = !!normalized.projectUrl && !!normalized.anonKey && !!eventId;
  const test = async () => {
    setTesting(true); setMessage(undefined);
    try {
      const result = await syncService.testConnection(normalized);
      setMessage({ text: result.ok ? 'Verbinding werkt. Sla je instellingen op om ze te gebruiken.' : connectionHelp(result.error), error: !result.ok });
    } catch { setMessage({ text: 'Verbinding testen mislukt. Probeer opnieuw.', error: true }); }
    finally { setTesting(false); }
  };
  return <div className="space-y-6">
    <SyncDiagnostics />
    <section className={ui.card}>
      <div><h3 className={ui.heading}><Cloud className="w-4 h-4 text-amber-400" />Samenwerken met meerdere pc's</h3><p className="mt-2 text-slate-400 leading-relaxed">Supabase is de online opslag die de pc's met elkaar verbindt. Op de hoofd-pc stel je dit eenmaal in. Op extra pc's volstaat daarna een koppellink. Met alleen lokale registratie kun je zonder Supabase werken; de centrale internettijd vereist wel deze verbinding.</p></div>
      <div className="flex flex-wrap gap-3" role="group" aria-label="Hoe wil je beginnen?">
        <button type="button" aria-pressed={route === 'setup'} className={route === 'setup' ? ui.primary : ui.secondary} onClick={() => setRoute('setup')}>Ik stel de hoofd-pc in</button>
        <button type="button" aria-pressed={route === 'join'} className={route === 'join' ? ui.primary : ui.secondary} onClick={() => setRoute('join')}>Ik heb een koppellink</button>
      </div>
    </section>
    {route === 'join' ? <DevicePairingPanel initialMode="join" title="Deze pc aansluiten" onJoined={onJoined} /> : <>

    <section className={ui.card}>
      <div>
        <h3 className={ui.heading}><Cloud className="w-4 h-4 text-amber-400" /> 1. Verbinding met het evenement</h3>
        <p className="text-slate-400 mt-2 leading-relaxed">Stel de verbinding in op de hoofd-pc, controleer de centrale tijd en voeg daarna de andere toestellen toe. Heb je al een koppellink? Ga direct naar ‘Toestel koppelen’ hieronder.</p>
      </div>
      <div className="rounded-xl bg-slate-950 border border-slate-800 p-4">
        <p className="text-white font-bold">{eventName || 'Geen evenement geselecteerd'}</p>
        <p className="text-slate-400 mt-1 break-all">Evenementcode: <span className="font-mono">{eventId || 'Nog niet beschikbaar'}</span></p>
        <p className="text-slate-500 mt-1">De verbinding gebruikt automatisch dit evenement.</p>
      </div>
      <details open={!syncService.getConfig().projectUrl || undefined} className="rounded-xl border border-slate-800 p-4">
        <summary className="cursor-pointer font-bold text-slate-200"><Database className="inline w-4 h-4 mr-2 text-amber-400" />Nog nooit met Supabase gewerkt? Begin hier</summary>
        <div className="mt-4"><SupabaseSetupGuide /></div>
      </details>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block font-semibold">Projectadres (Project URL)<input type="url" value={config.projectUrl} onChange={e => update({ projectUrl: e.target.value })} placeholder="https://jouw-project.supabase.co" className={`${ui.input} mt-1.5 font-mono`} /></label>
        <label className="block font-semibold">Publieke toegangssleutel (Publishable key)<input type="password" autoComplete="off" value={config.anonKey} onChange={e => update({ anonKey: e.target.value })} placeholder="Publishable of anon public key" className={`${ui.input} mt-1.5 font-mono`} /><span className="block mt-1.5 text-slate-500 font-normal">Gebruik de publishable/anon key, nooit een secret/service_role key.</span></label>
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={config.enabled} onChange={e => update({ enabled: e.target.checked })} className="w-4 h-4 mt-0.5 accent-amber-500" />
        <span><strong className="text-white">Online synchronisatie inschakelen</strong><span className="block text-slate-400 mt-1">Wordt actief na opslaan. Registraties worden steeds eerst lokaal bewaard.</span></span>
      </label>
      <div className="flex flex-wrap gap-3 border-t border-slate-800 pt-4">
        <button type="button" className={ui.secondary} disabled={testing || !canConnect} onClick={test}>{testing ? 'Verbinding testen…' : 'Verbinding testen'}</button>
        <button type="button" className={ui.primary} disabled={testing || (config.enabled && !canConnect)} onClick={() => { syncService.saveConfig(normalized); setConfig(normalized); setMessage({ text: normalized.enabled ? 'Instellingen opgeslagen. Synchronisatie is ingeschakeld.' : 'Instellingen opgeslagen. Synchronisatie is uitgeschakeld.' }); }}>Instellingen opslaan</button>
      </div>
      {message && <p role="status" className={message.error ? 'text-red-400' : 'text-emerald-400'}>{message.text}</p>}
    </section>
    <section className={ui.card}>
      <div><h3 className={ui.heading}><Clock className="w-4 h-4 text-amber-400" /> 2. Centrale tijd controleren</h3><p className="text-slate-400 mt-2">Klik na het opslaan op "Tijd opnieuw meten". Wacht tot "Centrale tijd: gemeten" verschijnt. Alle gekoppelde pc’s gebruiken dezelfde tijdserver.</p></div>
      <ClockStatus embedded />
    </section>
    <DevicePairingPanel title="3. Andere pc toevoegen" onJoined={onJoined} />
    </>}
  </div>;
}
