import React, { useEffect, useState } from 'react';
import type { Participant } from '../types';
import { db } from '../db/dexieDb';
import { competitionAge } from '../services/participantClassification';
import { planAgeBibs, updateBibs, type BibAgeRange, type BibChange } from '../services/bibAssignment';

export function BibAssignmentModal({ participants, onClose, onRefresh }: { participants: Participant[]; onClose: () => void; onRefresh: () => void }) {
  const [date, setDate] = useState('');
  const [ranges, setRanges] = useState<BibAgeRange[]>([{ minAge: 0, maxAge: 11, firstBib: 1, lastBib: 100 }]);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [preview, setPreview] = useState<BibChange[]>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void db.events.toCollection().first().then(event => setDate(event?.date ?? '')).catch(error => setMessage(error.message)); }, []);
  const changeRanges = (next: BibAgeRange[]) => { setRanges(next); setPreview(undefined); setMessage(''); };
  const run = async (action: () => Promise<void>) => { setBusy(true); setMessage(''); try { await action(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } };
  const missingBirthDate = participants.filter(p => !p.stamhoofdInactive && (!onlyMissing || !p.bibNumber) && competitionAge(p.birthDate, date) === undefined).length;
  return <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Borstnummers op leeftijd">
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-3xl max-h-[90vh] overflow-auto space-y-4 text-white">
      <div className="flex justify-between"><h2 className="text-xl font-bold">Borstnummers per leeftijdsbereik</h2><button disabled={busy} onClick={onClose}>Sluiten</button></div>
      <p className="text-sm text-slate-300">Leeftijd op 31 december {date.slice(0, 4) || '(stel de evenementdatum in)'}. Grenzen zijn inclusief. Binnen elk bereik nummeren we alfabetisch op achternaam en voornaam. Reeds bezette nummers buiten de selectie worden overgeslagen. Dit geldt voor alle deelnemers, ongeacht het lijstfilter.</p>
      <fieldset disabled={busy} className="space-y-3">
        {ranges.map((range, index) => <div key={index} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
          {([['minAge', 'Leeftijd vanaf'], ['maxAge', 'Leeftijd t/m'], ['firstBib', 'Borstnummer vanaf'], ['lastBib', 'Borstnummer t/m']] as const).map(([key, label]) => <label key={key} className="text-xs">{label}<input type="number" min={key.includes('Age') ? 0 : 1} step="1" value={Number.isNaN(range[key]) ? '' : range[key]} onChange={e => changeRanges(ranges.map((r, i) => i === index ? { ...r, [key]: e.target.value === '' ? NaN : Number(e.target.value) } : r))} className="block w-full rounded bg-slate-800 p-2 mt-1" /></label>)}
          <button onClick={() => changeRanges(ranges.filter((_, i) => i !== index))} className="text-red-300 py-2">Verwijderen</button>
        </div>)}
        <button onClick={() => changeRanges([...ranges, { minAge: (ranges.at(-1)?.maxAge ?? -1) + 1, maxAge: (ranges.at(-1)?.maxAge ?? -1) + 10, firstBib: (ranges.at(-1)?.lastBib ?? 0) + 1, lastBib: (ranges.at(-1)?.lastBib ?? 0) + 100 }])} className="bg-slate-700 px-3 py-2 rounded">Bereik toevoegen</button>
        <label className="block text-sm"><input type="checkbox" checked={onlyMissing} onChange={e => { setOnlyMissing(e.target.checked); setPreview(undefined); }} /> Alleen deelnemers zonder borstnummer</label>
        <p className="text-sm text-amber-300">{missingBirthDate} deelnemers zonder geldige geboortedatum worden overgeslagen. Deelnemers buiten de leeftijdsbereiken blijven ongewijzigd.</p>
        <button className="bg-blue-600 rounded px-4 py-2" onClick={() => { try { setMessage(''); setPreview(planAgeBibs(participants, date, ranges, onlyMissing)); } catch (error) { setPreview(undefined); setMessage((error as Error).message); } }}>Preview bekijken</button>
        {preview && <><p>{preview.length} borstnummers worden aangepast.</p><div className="max-h-64 overflow-auto"><table className="w-full text-sm text-left"><thead><tr><th>Deelnemer</th><th>Leeftijd</th><th>Oud</th><th>Nieuw</th></tr></thead><tbody>{preview.map(row => <tr key={row.participantId}><td>{row.name}</td><td>{row.age}</td><td>{row.oldBib ?? '—'}</td><td>{row.bibNumber}</td></tr>)}</tbody></table></div><button disabled={!preview.length} className="bg-emerald-600 disabled:opacity-50 rounded px-4 py-2" onClick={() => run(async () => { const count = await updateBibs({ clear: false, ranges, onlyMissing, preview }); setPreview(undefined); setMessage(`${count} borstnummers toegekend.`); onRefresh(); })}>Borstnummers toekennen</button></>}
      </fieldset>
      {message && <p role="status" className="text-amber-300">{message}</p>}
    </div>
  </div>;
}
