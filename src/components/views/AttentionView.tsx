import React, { useState } from 'react';
import {
  AlertTriangle,
  AlertOctagon,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Search,
  Crosshair,
  UserX,
  FileText,
} from 'lucide-react';
import type { RaceConflict, Participant, TimingRecord, ShootingResult, AuditLog } from '../../types';
import { formatLocalTime } from '../../services/timingEngine';

interface AttentionViewProps {
  conflicts: RaceConflict[];
  participants: Participant[];
  timingRecords: TimingRecord[];
  shootingResults: ShootingResult[];
  auditLogs: AuditLog[];
  onOpenConflict: (conflict: RaceConflict) => void;
  onSelectParticipant: (participant: Participant) => void;
}

export const AttentionView: React.FC<AttentionViewProps> = ({
  conflicts,
  participants,
  timingRecords,
  shootingResults,
  auditLogs,
  onOpenConflict,
  onSelectParticipant,
}) => {
  const [auditFilter, setAuditFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'conflicts' | 'anomalies' | 'audit'>('conflicts');

  const unresolvedConflicts = conflicts.filter((c) => !c.resolvedAt);

  // Anomaly checks
  const bibMap = new Map<number, Participant>(
    participants.filter((p) => p.bibNumber !== undefined).map((p) => [p.bibNumber!, p])
  );

  // 1. Unknown emergency bibs
  const unknownBibRecords = timingRecords.filter((r) => r.isUnknownBib && !r.isReversed);

  // 2. Finished without start
  const finishedBibs = new Set<number>(
    timingRecords
      .filter((r) => r.type === 'FINISH' && !r.isReversed && r.bibNumber !== undefined)
      .map((r) => r.bibNumber!)
  );
  const startedBibs = new Set<number>(
    timingRecords
      .filter((r) => r.type === 'START' && !r.isReversed && r.bibNumber !== undefined)
      .map((r) => r.bibNumber!)
  );

  const finishedWithoutStart: number[] = Array.from(finishedBibs).filter((b) => !startedBibs.has(b));

  // 3. Finished without shooting round
  const shootingBibs = new Set(shootingResults.map((s) => s.bibNumber));
  const finishedWithoutShooting = Array.from(finishedBibs).filter((b) => !shootingBibs.has(b));

  // Filtered audit logs
  const filteredAudits = auditLogs.filter((a) => {
    if (!auditFilter.trim()) return true;
    const q = auditFilter.toLowerCase();
    return (
      a.action.toLowerCase().includes(q) ||
      a.details.toLowerCase().includes(q) ||
      a.operator.toLowerCase().includes(q) ||
      a.deviceId.toLowerCase().includes(q) ||
      String(a.bibNumber || '').includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-red-400 font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Probleemoplossing & Audit
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight mt-0.5">
            Conflicten, Afwijkingen & Auditlog
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {unresolvedConflicts.length} onopgeloste conflicten • {unknownBibRecords.length + finishedWithoutStart.length + finishedWithoutShooting.length} afwijkingen
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-850 p-1 rounded-xl border border-slate-750 text-xs">
          <button
            onClick={() => setActiveTab('conflicts')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
              activeTab === 'conflicts'
                ? 'bg-red-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <AlertOctagon className="w-4 h-4" />
            <span>Conflicten ({unresolvedConflicts.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('anomalies')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
              activeTab === 'anomalies'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Afwijkingen ({unknownBibRecords.length + finishedWithoutStart.length + finishedWithoutShooting.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Auditlog ({auditLogs.length})</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Conflicts Resolver List */}
      {activeTab === 'conflicts' && (
        <div className="space-y-4">
          {unresolvedConflicts.length === 0 ? (
            <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h3 className="text-base font-bold text-white">Geen openstaande conflicten</h3>
              <p className="text-xs text-slate-400">
                Alle finish- en schietregistraties zijn consistent verwerkt over alle apparaten.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {unresolvedConflicts.map((c) => (
                <div
                  key={c.id}
                  className="bg-slate-900 border-2 border-red-500/50 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-red-500 text-slate-950 font-black text-xl flex items-center justify-center shrink-0">
                      #{c.bibNumber}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-white">
                          Finish Conflict: Deelnemer #{c.bibNumber}
                        </h4>
                        <span className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded font-bold uppercase">
                          Aandacht vereist
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        Optie A: <strong className="font-mono text-white">{formatLocalTime(c.recordA.timestamp, true)}</strong> ({c.recordA.deviceId})
                        {' vs '}
                        Optie B: <strong className="font-mono text-white">{formatLocalTime(c.recordB.timestamp, true)}</strong> ({c.recordB.deviceId})
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => onOpenConflict(c)}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg transition"
                  >
                    Beslis & Los Op
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Anomalies & Unknown Bibs */}
      {activeTab === 'anomalies' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Unknown Bib emergency records */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <UserX className="w-4 h-4 text-amber-400" /> Noodtijden (Onbekend Startnummer)
            </h3>
            {unknownBibRecords.length === 0 ? (
              <p className="text-xs text-slate-500 italic p-3">
                Geen noodregistraties voor onbekende lopers
              </p>
            ) : (
              <div className="space-y-2">
                {unknownBibRecords.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 bg-slate-850 rounded-xl border border-slate-750 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-amber-400">
                        Nood-Bib #{r.bibNumber}
                      </span>
                      <span className="text-slate-400 block text-[11px]">
                        Tijd: {formatLocalTime(r.timestamp, true)} ({r.deviceId})
                      </span>
                    </div>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-bold">
                      Koppeling vereist
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Finished without start */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-red-400" /> Gefinisht Zonder Starttijd
            </h3>
            {finishedWithoutStart.length === 0 ? (
              <p className="text-xs text-slate-500 italic p-3">
                Alle gefinishte deelnemers hebben een geldige starttijd
              </p>
            ) : (
              <div className="space-y-2">
                {finishedWithoutStart.map((bib) => {
                  const p = bibMap.get(bib);
                  return (
                    <div
                      key={`fws-bib-${bib}`}
                      onClick={() => p && onSelectParticipant(p)}
                      className="p-3 bg-slate-850 rounded-xl border border-slate-750 flex items-center justify-between text-xs cursor-pointer hover:bg-slate-800 transition"
                    >
                      <div>
                        <span className="font-mono font-bold text-white">Bib #{bib}</span>
                        <span className="text-slate-400 block text-[11px]">
                          {p ? `${p.firstName} ${p.lastName}` : 'Onbekende atleet'}
                        </span>
                      </div>
                      <span className="text-xs text-red-400 font-semibold">Starttijd ontbreekt</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Finished without shooting result */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-blue-400" /> Gefinisht Zonder Schietresultaat
            </h3>
            {finishedWithoutShooting.length === 0 ? (
              <p className="text-xs text-slate-500 italic p-3">
                Alle gefinishte deelnemers hebben een geregistreerde schietbeurt
              </p>
            ) : (
              <div className="space-y-2">
                {finishedWithoutShooting.map((bib) => {
                  const participant = bibMap.get(bib);
                  return (
                    <button
                      key={`fwo-shooting-${bib}`}
                      type="button"
                      onClick={() => participant && onSelectParticipant(participant)}
                      className="w-full p-3 bg-slate-850 rounded-xl border border-slate-750 flex items-center justify-between text-xs text-left hover:bg-slate-800 transition"
                    >
                      <span>
                        <span className="font-mono font-bold text-white block">Bib #{bib}</span>
                        <span className="text-slate-400 block text-[11px]">
                          {participant ? `${participant.firstName} ${participant.lastName}` : 'Onbekende atleet'}
                        </span>
                      </span>
                      <span className="text-xs text-blue-300 font-semibold">Schietresultaat ontbreekt</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Full Audit Log */}
      {activeTab === 'audit' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-blue-400" /> Onveranderlijk Auditlogboek (Req 34)
              </h3>
              <p className="text-xs text-slate-400">
                Alle wijzigingen, starts, finishes, correcties en toestelacties
              </p>
            </div>

            <div className="relative min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
                placeholder="Filter logs op actie, bib, operator..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 font-mono text-[11px]">
            {filteredAudits.map((a) => (
              <div
                key={a.id}
                className="p-3 rounded-lg bg-slate-850 border border-slate-750 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-bold">
                      {formatLocalTime(a.timestamp, true)}
                    </span>
                    <span className="text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">
                      {a.action}
                    </span>
                    {a.bibNumber && (
                      <span className="text-blue-300 font-bold">Bib #{a.bibNumber}</span>
                    )}
                  </div>
                  <p className="text-slate-300 mt-1">{a.details}</p>
                  {a.reason && (
                    <p className="text-amber-200/80 text-[10px] italic">Reden: {a.reason}</p>
                  )}
                </div>

                <div className="text-right text-slate-500 text-[10px] shrink-0">
                  <span>Toestel: {a.deviceId}</span>
                  <span className="mx-1">•</span>
                  <span>Operator: {a.operator}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
