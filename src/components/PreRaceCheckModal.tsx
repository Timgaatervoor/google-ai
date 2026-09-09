import React, { useEffect, useState } from 'react';
import { raceClock } from '../services/raceClock';
import { syncService } from '../services/syncService';
import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck, X } from 'lucide-react';
import type { RaceEvent, Participant, Wave, RaceProfile, Category, RaceConflict } from '../types';
import { db } from '../db/dexieDb';
import { operationService } from '../services/operationService';

import { isElectronEnvironment } from '../services/systemCheckService';

interface PreRaceCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: RaceEvent | null;
  participants?: Participant[];
  waves?: Wave[];
  categories?: Category[];
  profiles?: RaceProfile[];
  conflicts?: RaceConflict[];
  pendingSyncCount?: number;
  onGoLiveSuccess?: () => void;
}

export const PreRaceCheckModal: React.FC<PreRaceCheckModalProps> = ({
  isOpen,
  onClose,
  event,
  participants = [],
  waves = [],
  categories = [],
  profiles = [],
  conflicts = [],
  pendingSyncCount = 0,
  onGoLiveSuccess = () => {},
}) => {
  const [storageChecked, setStorageChecked] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setStorageChecked(false);
    void db.events.count().then(() => setStorageChecked(true)).catch(() => setStorageChecked(false));
    setOfflineReady(typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller);
  }, [isOpen]);
  if (!isOpen) return null;
  const clock = raceClock.status();

  // Analysis
  const safeProfiles = profiles || [];
  const safeCategories = categories || [];
  const safeWaves = waves || [];
  const safeParticipants = (participants || []).filter(p => !p.stamhoofdInactive && p.status !== 'DNS');
  const safeConflicts = conflicts || [];

  const hasProfiles = safeProfiles.length > 0;
  const hasCategories = safeCategories.length > 0;
  const hasWaves = safeWaves.length > 0;
  const participantCount = safeParticipants.length;
  const hasParticipants = participantCount > 0;

  // Duplicate bib check
  const bibCounts = new Map<number, number>();
  let missingBibCount = 0;
  safeParticipants.forEach((p) => {
    if (!p.bibNumber) {
      missingBibCount++;
    } else {
      bibCounts.set(p.bibNumber, (bibCounts.get(p.bibNumber) || 0) + 1);
    }
  });

  const duplicateBibs = Array.from(bibCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([bib]) => bib);

  const unresolvedConflicts = safeConflicts.filter((c) => !c.resolvedAt);

  const missingAssignments = safeParticipants.filter(p => !safeCategories.some(c => c.id === p.categoryId) || !safeProfiles.some(profile => profile.id === p.raceProfileId));
  const overCapacity = safeWaves.filter(w => safeParticipants.filter(p => p.waveId === w.id).length > w.maxParticipants);
  const checks = [
    { label: 'Indeling deelnemers', status: missingAssignments.length ? 'fail' : 'pass', detail: missingAssignments.length ? missingAssignments.map(p => `${p.firstName} ${p.lastName}`).join(', ') : 'Iedere deelnemer heeft een categorie en wedstrijdprofiel.' },
    { label: 'Capaciteit startgroepen', status: overCapacity.length ? 'fail' : 'pass', detail: overCapacity.length ? overCapacity.map(w => w.name).join(', ') : 'Geen startgroepen over capaciteit.' },
    {
      label: 'Wedstrijdprofielen geconfigureerd',
      status: hasProfiles ? 'pass' : 'fail',
      detail: `${safeProfiles.length} profielen actief`,
    },
    {
      label: 'Categorieën geconfigureerd',
      status: hasCategories ? 'pass' : 'fail',
      detail: `${safeCategories.length} categorieën geregistreerd`,
    },
    {
      label: 'Deelnemersbestand geladen',
      status: hasParticipants ? 'pass' : 'fail',
      detail: `${participantCount} deelnemers geregistreerd`,
    },
    {
      label: 'Startnummers (Bibs) controle',
      status: duplicateBibs.length === 0 ? 'pass' : 'fail',
      detail:
        duplicateBibs.length === 0
          ? 'Geen dubbele startnummers gedetecteerd'
          : `Dubbele startnummers: ${duplicateBibs.join(', ')}`,
    },
    {
      label: 'Niet-toegewezen startnummers',
      status: missingBibCount === 0 ? 'pass' : 'warn',
      detail:
        missingBibCount === 0
          ? 'Alle deelnemers hebben een startnummer'
          : `${missingBibCount} deelnemers zonder startnummer`,
    },
    {
      label: 'Waves & Startgroepen',
      status: hasWaves ? 'pass' : 'warn',
      detail: `${safeWaves.length} waves ingesteld`,
    },
    {
      label: 'Conflicten & Afwijkingen',
      status: unresolvedConflicts.length === 0 ? 'pass' : 'warn',
      detail:
        unresolvedConflicts.length === 0
          ? 'Geen openstaande tijdconflicten'
          : `${unresolvedConflicts.length} onopgeloste tijdconflicten`,
    },
    {
      label: 'Lokale opslag (IndexedDB / Dexie.js)',
      status: storageChecked ? 'pass' : 'warn',
      detail: storageChecked ? 'Lokale database is leesbaar. Controleer ook een externe back-up.' : 'Lokale opslag nog niet gecontroleerd',
    },
    {
      label: 'Klok & Tijdsynchronisatie',
      status: clock.state === 'SYNCED' ? 'pass' : 'warn',
      detail: clock.state === 'SYNCED' ? `Centrale tijd gemeten, onzekerheid circa ${Math.ceil(clock.uncertaintyMs!)} ms` : 'Centrale tijd niet recent gemeten. Meet eerst via de tijdstatus bovenaan.',
    },
    {
      label: isElectronEnvironment() ? 'Desktop applicatie (Electron)' : 'Offline voorbereiding (PWA Cache)',
      status: isElectronEnvironment() ? 'pass' : (offlineReady ? 'pass' : 'warn'),
      detail: isElectronEnvironment()
        ? 'Draait als native desktop applicatie; geen browser service worker vereist.'
        : (offlineReady ? 'Offline serviceworker actief; voer ook een test zonder internet uit.' : 'Geen actieve offline serviceworker gedetecteerd'),
    },
    {
      label: 'Synchronisatiewachtrij',
      status: pendingSyncCount === 0 ? 'pass' : 'warn',
      detail: `${pendingSyncCount} lokale operaties in wachtrij`,
    },
  ];

  const canGoLive = hasProfiles && hasCategories && hasParticipants && duplicateBibs.length === 0 && missingBibCount === 0 && missingAssignments.length === 0 && overCapacity.length === 0 && unresolvedConflicts.length === 0 && (!syncService.getConfig().enabled || clock.state === 'SYNCED');

  const handleGoLive = async () => {
    if (!event || !canGoLive) return;
    await db.events.update(event.id, {
      status: 'LIVE',
      updatedAt: new Date().toISOString(),
    });
    await operationService.logAudit(
      'EVENT_GO_LIVE',
      `Event ${event.name} is nu LIVE gezet. ${participantCount} deelnemers klaar.`
    );
    onGoLiveSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-850">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Voorcontrole wedstrijd</h2>
              <p className="text-xs text-slate-400">
                Systeemcontrole vóór de wedstrijd officieel LIVE gaat
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-3">
          {checks.map((c, i) => (
            <div
              key={`pre-check-${c.label}-${i}`}
              className="flex items-start justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/60"
            >
              <div className="flex items-start gap-3">
                {c.status === 'pass' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
                {c.status === 'warn' && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
                {c.status === 'fail' && <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
                <div>
                  <h4 className="text-sm font-semibold text-white">{c.label}</h4>
                  <p className="text-xs text-slate-400">{c.detail}</p>
                </div>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                  c.status === 'pass'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : c.status === 'warn'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}
              >
                {c.status === 'pass' ? 'OK' : c.status === 'warn' ? 'AANDACHT' : 'FOUT'}
              </span>
            </div>
          ))}

          {/* Go Live Summary (Req 67) */}
          <div className="mt-4 p-4 rounded-lg bg-slate-800 border border-slate-700">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Wedstrijd Overzicht
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="bg-slate-900/80 p-2 rounded">
                <span className="text-slate-400 block">Deelnemers</span>
                <span className="text-base font-bold text-white">{participantCount}</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded">
                <span className="text-slate-400 block">Startgroepen</span>
                <span className="text-base font-bold text-white">{safeWaves.length}</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded">
                <span className="text-slate-400 block">Profielen</span>
                <span className="text-base font-bold text-white">{safeProfiles.length}</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded">
                <span className="text-slate-400 block">Conflicten</span>
                <span className={`text-base font-bold ${unresolvedConflicts.length === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {unresolvedConflicts.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-850 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {canGoLive ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Systeem is klaar voor de wedstrijd
              </span>
            ) : (
              <span className="text-red-400 font-semibold flex items-center gap-1.5">
                <XCircle className="w-4 h-4" /> Los kritieke aandachtspunten op vóór Go Live
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
            >
              Sluiten
            </button>
            {event?.status !== 'LIVE' && (
              <button
                onClick={handleGoLive}
                disabled={!canGoLive}
                className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 disabled:opacity-40 transition uppercase tracking-wider"
              >
                GO LIVE
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
