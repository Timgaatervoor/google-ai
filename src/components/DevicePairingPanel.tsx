import React, { useState } from 'react';
import { Laptop, Link, Copy } from 'lucide-react';
import type { UserRole } from '../types';
import { createDeviceInvite, readDeviceInvite, joinEvent } from '../services/devicePairing';
import { RealQrCode } from './RealQrCode';
import { syncStyles as ui } from './syncSettingsStyles';

export function DevicePairingPanel({ initialLink = '', initialMode = 'share', title = 'Toestel koppelen aan evenement', onJoined }: { initialLink?: string; initialMode?: 'share' | 'join'; title?: string; onJoined: () => void }) {
  const [mode, setMode] = useState<'share' | 'join'>(initialLink ? 'join' : initialMode);
  const [input, setInput] = useState(initialLink);
  const [invitation, setInvitation] = useState<{ link: string; code: string }>();
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof readDeviceInvite>>>();
  const [role, setRole] = useState<UserRole>('FINISH_OPERATOR');
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMessage(undefined);
    try { await fn(); } catch (error) { setMessage({ text: (error as Error).message, error: true }); }
    finally { setBusy(false); }
  };
  return <section className={ui.card}>
    <div><h3 className={ui.heading}><Laptop className="w-4 h-4 text-amber-400" />{title}</h3><p className="text-slate-400 mt-2">Deel het voorbereide evenement met een andere pc, of sluit deze pc aan met een ontvangen koppellink.</p></div>
    <fieldset disabled={busy} className="space-y-5 min-w-0">
      <legend className="sr-only">Kies hoe je het toestel wilt koppelen</legend>
      <div className="flex flex-wrap gap-2 p-1.5 bg-slate-950 border border-slate-800 rounded-xl" role="group" aria-label="Manier van koppelen">
        {([{ id: 'share', label: 'Andere pc toevoegen' }, { id: 'join', label: 'Deze pc aansluiten' }] as const).map(option => <button key={option.id} type="button" aria-pressed={mode === option.id} onClick={() => { setMode(option.id); setMessage(undefined); }} className={`flex-1 px-4 py-2.5 rounded-lg text-xs font-bold transition disabled:opacity-50 ${mode === option.id ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}>{option.label}</button>)}
      </div>
      {mode === 'share' ? <div className="space-y-4">
        <p className="text-slate-400 leading-relaxed">Doe dit op de hoofd-pc zodra deelnemers, profielen en startgroepen klaarstaan. Sla eerst de online verbinding op. Maak voor elke extra pc een eigen koppeling.</p>
        <button type="button" className={ui.primary} onClick={() => run(async () => { setInvitation(await createDeviceInvite()); })}><Link className="w-4 h-4" />{busy ? 'Koppeling maken...' : 'Koppeling voor nieuw toestel maken'}</button>
        {invitation && <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-5 items-start">
            <div className="shrink-0 max-w-full overflow-auto"><RealQrCode value={invitation.link} size={224} /></div>
            <div className="space-y-3 min-w-0 flex-1">
              <p className="font-bold text-white">Open deze link op de andere pc of scan de QR-code.</p>
              <p className="text-slate-400">De koppeling is 10 minuten geldig en kan eenmaal worden opgehaald.</p>
              <label className="block font-semibold">Koppellink<textarea readOnly value={invitation.link} className={`${ui.input} mt-1.5 h-24 text-xs font-mono`} /></label>
              <button type="button" className={ui.secondary} onClick={() => run(async () => {
                try { await navigator.clipboard.writeText(invitation.link); setMessage({ text: 'Koppellink gekopieerd.' }); }
                catch { throw new Error('Kopieer de link handmatig uit het tekstvak.'); }
              })}><Copy className="w-4 h-4" />Link kopiëren</button>
            </div>
          </div>
          <details className="border-t border-slate-800 pt-3"><summary className="cursor-pointer font-semibold">Losse code voor een al ingesteld toestel</summary><p className="text-slate-400 mt-2">Alleen bruikbaar als op de andere pc hetzelfde Supabase-project is ingesteld.</p><p className="mt-2 font-mono text-white break-all select-all">{invitation.code}</p></details>
        </div>}
      </div> : <div className="space-y-4">
        <p className="text-slate-400 leading-relaxed">Plak de koppellink van de hoofd-pc. Bekijk eerst het evenement en kies daarna de post voor dit toestel.</p>
        {!preview && <>
          <label className="block font-semibold">Koppellink of code<input value={input} onChange={e => setInput(e.target.value)} placeholder="Plak hier de ontvangen koppellink" className={`${ui.input} mt-1.5`} /></label>
          <button type="button" className={ui.primary} disabled={!input.trim()} onClick={() => run(async () => { setPreview(await readDeviceInvite(input)); setInput(''); history.replaceState(null, '', location.pathname + location.search); })}>{busy ? 'Evenement ophalen...' : 'Evenement ophalen en bekijken'}</button>
          <p className="text-slate-500">Ophalen verbruikt de eenmalige code. Je lokale evenement verandert pas na bevestiging hieronder.</p>
        </>}
        {preview && <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-4">
          <div><h4 className="font-bold text-white text-sm">{preview.snapshot.data.event.name}</h4><p className="mt-1 text-slate-400">{preview.snapshot.data.event.date} · {preview.snapshot.data.participants.length} deelnemers · {preview.snapshot.data.waves.length} startgroepen</p></div>
          <label className="block font-semibold">Post voor deze pc<select value={role} onChange={e => setRole(e.target.value as UserRole)} className={`${ui.input} mt-1.5`}><option value="START_OPERATOR">Start</option><option value="SHOOTING_OPERATOR">Schieten</option><option value="FINISH_OPERATOR">Finish</option><option value="VIEWER">Scorebord</option></select></label>
          <p className="text-amber-300 leading-relaxed">Dit vervangt het lokale evenement. Eerst wordt automatisch een lokale back-up bewaard.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={ui.primary} onClick={() => run(async () => { await joinEvent(preview, role); setPreview(undefined); setMessage({ text: 'Toestel gekoppeld.' }); onJoined(); })}>{busy ? 'Toestel koppelen...' : 'Dit evenement gebruiken op deze pc'}</button>
            <button type="button" className={ui.secondary} onClick={() => { setPreview(undefined); setMessage({ text: 'Niet aangesloten. Vraag een nieuwe koppellink om opnieuw te beginnen.' }); }}>Annuleren</button>
          </div>
        </div>}
      </div>}
    </fieldset>
    {message && <p role="status" className={message.error ? 'text-red-400' : 'text-emerald-400'}>{message.text}</p>}
  </section>;
}
