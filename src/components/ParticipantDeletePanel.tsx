import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { getActiveEventId } from '../db/dexieDb';
import { deleteParticipantData, deleteTargetLabels, type ParticipantDeleteTarget } from '../services/participantDeletion';
import { SafeConfirmButton } from './SafeConfirmButton';

export function ParticipantDeletePanel({ participantId, name, onDeleted }: { participantId: string; name: string; onDeleted: () => void; key?: string }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ParticipantDeleteTarget>('start');
  const [round, setRound] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    setBusy(true); setError('');
    try {
      await deleteParticipantData(await getActiveEventId(), participantId, target, reason, target === 'shooting' && round ? Number(round) : undefined);
      onDeleted();
    } catch (err) { setError(err instanceof Error ? err.message : 'Wissen mislukt.'); }
    finally { setBusy(false); }
  };
  return <div className="border-t border-slate-800 px-6 py-3 text-xs">
    {!open ? <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" />Wissen…</button> :
      <div className="space-y-3" role="group" aria-label="Deelnemergegevens wissen">
        <p className="font-bold text-white">Wat wil je wissen bij {name}?</p>
        <label className="block">Gegevens
          <select value={target} disabled={busy} onChange={e => setTarget(e.target.value as ParticipantDeleteTarget)} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-800 p-2">
            {Object.entries(deleteTargetLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {target === 'shooting' && <label className="block">Schietronde (leeg = alle rondes)
          <input type="number" min="1" step="1" value={round} disabled={busy} onChange={e => setRound(e.target.value)} className="mt-1 block w-full rounded-lg bg-slate-800 p-2" />
        </label>}
        <label className="block">Reden (optioneel)<input value={reason} disabled={busy} onChange={e => setReason(e.target.value)} className="mt-1 block w-full rounded-lg bg-slate-800 p-2" /></label>
        <p className="text-red-200">{target === 'participant' ? 'De deelnemer, alle tijden en alle schietregistraties worden verwijderd.' : target === 'shooting' ? 'De gekozen schietronde(s), inclusief eerdere correcties, worden gewist.' : 'Alle registraties van deze tijdsoort worden gewist; de andere wedstrijdgegevens blijven behouden.'} Dit wordt ook op gekoppelde toestellen verwerkt.</p>
        {error && <p role="alert" className="text-red-300">{error}</p>}
        <div className="flex items-center gap-2 pt-1">
          <SafeConfirmButton
            label="Gegevens wissen"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            confirmPrompt="Klik om te wissen (of houd 3s vast)"
            successMessage="Gegevens succesvol gewist."
            variant="danger"
            disabled={busy}
            onConfirm={remove}
          />
          <button type="button" disabled={busy} onClick={() => { setOpen(false); setError(''); }} className="rounded-xl bg-slate-800 px-4 py-2 font-semibold text-slate-300 hover:bg-slate-700">Annuleren</button>
        </div>
      </div>}
  </div>;
}
