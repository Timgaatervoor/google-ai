import React from 'react';
import {
  Users,
  PlayCircle,
  Crosshair,
  Flag,
  AlertTriangle,
  Clock,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import type {
  RaceEvent,
  Participant,
  TimingRecord,
  ShootingResult,
  Wave,
  RaceResult,
  RaceConflict,
} from '../../types';
import { formatLocalTime } from '../../services/timingEngine';
import type { ActiveTab } from '../Navigation';

interface EventDashboardViewProps {
  event: RaceEvent | null;
  participants: Participant[];
  timingRecords: TimingRecord[];
  shootingResults: ShootingResult[];
  waves: Wave[];
  results: RaceResult[];
  conflicts: RaceConflict[];
  onNavigate: (tab: ActiveTab) => void;
  onOpenPreRaceCheck: () => void;
}

export const EventDashboardView: React.FC<EventDashboardViewProps> = ({
  event,
  participants,
  timingRecords,
  shootingResults,
  waves,
  results,
  conflicts,
  onNavigate,
  onOpenPreRaceCheck,
}) => {
  const totalParticipants = participants.length;
  const startedCount = participants.filter((p) => p.status === 'STARTED').length;
  const finishedCount = participants.filter((p) => p.status === 'FINISHED').length;
  const dnfCount = participants.filter((p) => p.status === 'DNF').length;
  const dnsCount = participants.filter((p) => p.status === 'DNS').length;
  const readyCount = participants.filter((p) => !p.status || p.status === 'READY' || p.status === 'REGISTERED').length;

  const activeConflictsCount = conflicts.filter((c) => !c.resolvedAt).length;

  // Recent 5 finishes
  const recentFinishes = [...results]
    .filter((r) => r.status === 'FINISHED')
    .sort((a, b) => (b.finishTime || '').localeCompare(a.finishTime || ''))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-4 flex flex-wrap gap-3 text-sm">
        <strong>Voorbereiding:</strong>
        <button className="text-amber-300 underline" onClick={() => onNavigate('participants')}>1. Import en indeling</button>
        <button className="text-amber-300 underline" onClick={() => onNavigate('participants')}>2. Borstnummers</button>
        <button className="text-amber-300 underline" onClick={() => onNavigate('waves')}>3. Startgroepen</button>
        <button className="text-amber-300 underline" onClick={() => onNavigate('settings')}>4. Toestellen en back-up</button>
        <button className="text-amber-300 underline" onClick={onOpenPreRaceCheck}>5. Startcontrole</button>
      </div>
      {/* Top Banner / Event Status */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono uppercase tracking-widest text-emerald-400 font-bold">
              Wedstrijdoverzicht
            </span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            {event?.name || 'Nieuw evenement'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Locatie: {event?.location || 'Locatie nog niet ingesteld'} • Straf per misser: {event?.penaltySecondsPerMiss || 20} sec
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => onNavigate('start')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition uppercase tracking-wider"
          >
            <PlayCircle className="w-4 h-4" /> Startpost
          </button>
          <button
            onClick={() => onNavigate('shooting')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-slate-950 font-bold text-xs shadow-lg shadow-blue-500/20 transition uppercase tracking-wider"
          >
            <Crosshair className="w-4 h-4" /> Schietstand
          </button>
          <button
            onClick={() => onNavigate('finish')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition uppercase tracking-wider"
          >
            <Flag className="w-4 h-4" /> Finishpost
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 shadow">
          <span className="text-xs text-slate-400 block font-medium">Totaal Deelnemers</span>
          <span className="text-2xl font-black font-mono text-white mt-1 block">
            {totalParticipants}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">100% lokaal gereed</span>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 shadow">
          <span className="text-xs text-blue-400 block font-medium">Aan de Start</span>
          <span className="text-2xl font-black font-mono text-blue-400 mt-1 block">
            {readyCount}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">{waves.length} waves</span>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 shadow">
          <span className="text-xs text-amber-400 block font-medium">Onderweg</span>
          <span className="text-2xl font-black font-mono text-amber-400 mt-1 block">
            {startedCount}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">actief op parcours</span>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 shadow">
          <span className="text-xs text-emerald-400 block font-medium">Gefinisht</span>
          <span className="text-2xl font-black font-mono text-emerald-400 mt-1 block">
            {finishedCount}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            {totalParticipants > 0 ? `${Math.round((finishedCount / totalParticipants) * 100)}%` : '0%'}
          </span>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 shadow">
          <span className="text-xs text-slate-400 block font-medium">DNF / DNS</span>
          <span className="text-2xl font-black font-mono text-slate-300 mt-1 block">
            {dnfCount + dnsCount}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            {dnfCount} DNF, {dnsCount} DNS
          </span>
        </div>

        <div
          onClick={() => onNavigate('attention')}
          className={`p-4 rounded-xl border shadow cursor-pointer transition ${
            activeConflictsCount > 0
              ? 'bg-red-950/30 border-red-500/50 hover:bg-red-900/30'
              : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <span className="text-xs text-slate-400 block font-medium flex items-center justify-between">
            <span>Conflicten</span>
            {activeConflictsCount > 0 && (
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            )}
          </span>
          <span
            className={`text-2xl font-black font-mono mt-1 block ${
              activeConflictsCount > 0 ? 'text-red-400' : 'text-emerald-400'
            }`}
          >
            {activeConflictsCount}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            {activeConflictsCount > 0 ? 'Direct oplossen' : 'Geen afwijkingen'}
          </span>
        </div>
      </div>

      {/* Main Content Grid: Wave Status & Recent Finishes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Wave Timeline & Live Operations */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" /> Startgroepen & startvolgorde
              </h3>
              <button
                onClick={() => onNavigate('waves')}
                className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
              >
                Beheren <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-2">
              {waves.slice(0, 6).map((wave) => {
                const waveParticipants = participants.filter((p) => p.waveId === wave.id);
                const waveFinished = waveParticipants.filter((p) => p.status === 'FINISHED').length;

                return (
                  <div
                    key={wave.id}
                    className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-700/80 font-mono font-bold text-amber-400 flex items-center justify-center">
                        {wave.waveNumber}
                      </div>
                      <div>
                        <span className="font-semibold text-white block">{wave.name}</span>
                        <span className="text-slate-400 font-mono">
                          Gepland: {wave.scheduledStartTime}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="font-mono text-slate-300 font-medium">
                          {waveFinished} / {waveParticipants.length} gefinisht
                        </span>
                        <div className="w-24 bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1">
                          <div
                            className="bg-emerald-400 h-full transition-all"
                            style={{
                              width: `${
                                waveParticipants.length > 0
                                  ? (waveFinished / waveParticipants.length) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          wave.status === 'STARTED'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : wave.status === 'COMPLETED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {wave.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Live Recent Finishes */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Flag className="w-4 h-4 text-emerald-400" /> Recente Finishes
              </h3>
              <button
                onClick={() => onNavigate('live')}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
              >
                Volledig Klassement <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {recentFinishes.length === 0 ? (
              <p className="text-xs text-slate-500 italic p-4 text-center">
                Nog geen finishes geregistreerd. Start een wave of gebruik de simulator om de race te starten.
              </p>
            ) : (
              <div className="space-y-2">
                {recentFinishes.map((r) => (
                  <div
                    key={r.participantId}
                    className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 font-mono font-bold flex items-center justify-center">
                        #{r.bibNumber}
                      </span>
                      <div>
                        <span className="font-semibold text-white block">{r.name}</span>
                        <span className="text-[11px] text-slate-400">
                          {r.categoryName} • {r.totalMisses} missers
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-black text-emerald-400 block">
                        {r.officialTimeFormatted}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatLocalTime(r.finishTime, true)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
