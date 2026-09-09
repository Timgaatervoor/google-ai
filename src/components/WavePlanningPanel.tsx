import React, { useState } from 'react';
import type { Participant, Wave } from '../types';
import { db } from '../db/dexieDb';
import { applyWavePlan, planWaves, validateWaveSettings, type WaveSettings, type WaveGrouping, type WavePlan } from '../services/wavePlanning';

export function WavePlanningPanel({ waves, participants, settings, onChange, onRefresh }: { waves: Wave[]; participants: Participant[]; settings: WaveSettings; onChange: (settings: WaveSettings) => void; onRefresh: () => void }) {
  const [grouping, setGrouping] = useState<WaveGrouping>('registration');
  const [preview, setPreview] = useState<WavePlan>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMessage(''); try { await fn(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } };
  const update = (patch: Partial<WaveSettings>) => { onChange({ ...settings, ...patch }); setPreview(undefined); };
  return <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-white">
    <h3 className="font-bold">Instellingen voor nieuwe waves</h3>
    <fieldset disabled={busy} className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-sm">Eerste startuur<input type="time" step="1" value={settings.firstStartTime} onChange={e => update({ firstStartTime: e.target.value })} className="block w-full bg-slate-800 rounded p-2" /></label>
        <label className="text-sm">Interval (minuten)<input type="number" min="1" max="1440" value={settings.intervalMinutes || ''} onChange={e => update({ intervalMinutes: Number(e.target.value) })} className="block w-full bg-slate-800 rounded p-2" /></label>
        <label className="text-sm">Standaardaantal deelnemers<input type="number" min="1" max="1000" value={settings.capacity || ''} onChange={e => update({ capacity: Number(e.target.value) })} className="block w-full bg-slate-800 rounded p-2" /></label>
      </div>
      <p className="text-xs text-slate-400">Nieuwe waves volgen op het laatste geplande startuur. Bestaande starturen en capaciteiten blijven behouden.</p>
      <button className="px-3 py-2 rounded bg-slate-700" onClick={() => run(async () => { validateWaveSettings(settings); const event = await db.events.toCollection().first(); if (!event) throw new Error('Maak eerst een evenement aan.'); await db.events.update(event.id, { waveSettings: settings }); setMessage('Wave-instellingen opgeslagen voor dit evenement.'); })}>Instellingen opslaan</button>
      <div className="border-t border-slate-700 pt-4 space-y-3">
        <h3 className="font-bold">Automatisch indelen op basis van inschrijving</h3>
        <label className="block text-sm">Indeling<select value={grouping} onChange={e => { setGrouping(e.target.value as WaveGrouping); setPreview(undefined); }} className="block w-full bg-slate-800 rounded p-2">
          <option value="registration">Inschrijvingsvolgorde — oudste eerst</option>
          <option value="article">Per artikel, daarbinnen oudste inschrijving eerst</option>
          <option value="profile">Per wedstrijdprofiel, daarbinnen oudste inschrijving eerst</option>
        </select></label>
        <p className="text-xs text-slate-400">Alleen actieve deelnemers zonder startgroep worden toegevoegd. Beschikbare waves worden gevuld tot hun capaciteit; zo nodig komen er nieuwe bij. Bestaande toewijzingen en gestarte waves blijven behouden.</p>
        <button className="bg-blue-600 rounded px-4 py-2" onClick={() => run(async () => { setPreview(undefined); const event = await db.events.toCollection().first(); if (!event) throw new Error('Maak eerst een evenement aan.'); setPreview(planWaves(event.id, waves, participants, settings, grouping)); })}>Indeling bekijken</button>
        {preview && <div className="space-y-3">
          <p>{preview.assignments.length} deelnemers toevoegen; {preview.created.length} nieuwe waves.</p>
          {!!preview.fallbackDates && <p className="text-amber-300 text-sm">Bij {preview.fallbackDates} deelnemers ontbreekt de oorspronkelijke inschrijvingsdatum. Hiervoor gebruiken we de lokale aanmaakdatum. Opnieuw synchroniseren met Stamhoofd vult de oorspronkelijke datum aan als die beschikbaar is.</p>}
          {preview.skipped.map((text, index) => <p className="text-amber-300 text-sm" key={index}>{text}</p>)}
          <div className="max-h-72 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Deelnemer</th><th>Startgroep</th><th>Startuur</th></tr></thead><tbody>{preview.assignments.map(a => { const wave = [...waves, ...preview.created].find(w => w.id === a.waveId); return <tr key={a.participantId}><td>{a.name}</td><td>{wave?.name}</td><td>{wave?.scheduledStartTime}</td></tr>; })}</tbody></table></div>
          <button disabled={!preview.assignments.length} className="bg-emerald-600 disabled:opacity-40 rounded px-4 py-2" onClick={() => run(async () => { const count = await applyWavePlan(settings, grouping, preview); setPreview(undefined); setMessage(`${count} deelnemers in waves ingedeeld.`); onRefresh(); })}>Indeling toepassen</button>
        </div>}
      </div>
    </fieldset>
    {message && <p role="status" className="text-amber-300">{message}</p>}
  </section>;
}
