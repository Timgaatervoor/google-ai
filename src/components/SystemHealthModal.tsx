import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  HardDrive,
  Laptop,
  Clock,
  Cloud,
  Database,
} from 'lucide-react';
import { runFullSystemCheck, type SystemCheckReport } from '../services/systemCheckService';

interface SystemHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemHealthModal: React.FC<SystemHealthModalProps> = ({ isOpen, onClose }) => {
  const [report, setReport] = useState<SystemCheckReport | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshReport = async () => {
    setLoading(true);
    try {
      const res = await runFullSystemCheck();
      setReport(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshReport();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="p-5 bg-slate-850 border-b border-slate-750 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-bold text-white">Systeemcontrole & Diagnostiek</h3>
              <p className="text-slate-400 text-[11px]">
                Validatie van lokale IndexedDB, tijdklok, back-ups en Electron/PWA runtime
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-750 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Status badge banner */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800 border border-slate-750">
            <div className="flex items-center gap-2">
              <span className="text-slate-300 font-semibold">Omgeving:</span>
              <span className="px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {report?.isElectron ? 'Desktop (Electron)' : report?.isPwa ? 'Standalone (PWA)' : 'Webbrowser'}
              </span>
            </div>
            <button
              onClick={refreshReport}
              disabled={loading}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-650 text-slate-200 transition font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Opnieuw scannen
            </button>
          </div>

          {/* List of checks */}
          <div className="space-y-2.5">
            {report?.items.map((item) => {
              const isPass = item.status === 'pass';
              const isWarn = item.status === 'warn';
              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-xl border flex items-start gap-3 transition ${
                    isPass
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                      : isWarn
                      ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                      : 'bg-red-950/30 border-red-500/40 text-red-200'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isPass && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {isWarn && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                    {!isPass && !isWarn && <XCircle className="w-4 h-4 text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-white text-xs">{item.label}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{item.timestamp}</span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">{item.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-850 border-t border-slate-750 flex items-center justify-between">
          <div className="text-slate-400 text-[11px]">
            {report?.failureCount === 0 && report?.warningCount === 0 && (
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Alle controles zijn geslaagd.
              </span>
            )}
            {(report?.failureCount ?? 0) > 0 && (
              <span className="text-red-400 font-semibold">
                {report?.failureCount} kritieke fout(en) gevonden.
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-semibold transition"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};
