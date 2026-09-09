import React, { useState } from 'react';
import { AlertOctagon, Check, X, ShieldAlert } from 'lucide-react';
import type { RaceConflict } from '../types';
import { db } from '../db/dexieDb';
import { operationService, generateUUID } from '../services/operationService';
import { formatLocalTime } from '../services/timingEngine';

interface ConflictResolverModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflict: RaceConflict | null;
  onResolved: () => void;
}

export const ConflictResolverModal: React.FC<ConflictResolverModalProps> = ({
  isOpen,
  onClose,
  conflict,
  onResolved,
}) => {
  const [selectedWinner, setSelectedWinner] = useState<'A' | 'B'>('A');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !conflict) return null;

  const recA = conflict.recordA;
  const recB = conflict.recordB;

  const handleResolve = async () => {
    if (!reason.trim()) {
      setError('Geef een motivatie op voor de wedstrijdleiding (Req 33/44)');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if ((await db.events.get(conflict.eventId))?.officialResultsLocked) throw new Error('De uitslagen zijn vergrendeld.');
      const chosenRecord = selectedWinner === 'A' ? recA : recB;
      const discardedRecord = selectedWinner === 'A' ? recB : recA;

      // Invalidate the discarded record without deleting it
      if (discardedRecord.id) {
        await db.timingRecords.update(discardedRecord.id, {
          isReversed: true,
          reversedReason: `Conflict beslecht t.v.v. registratie ${selectedWinner}: ${reason}`,
        });
      }

      // Mark conflict resolved
      await db.conflicts.update(conflict.id, {
        resolvedAt: new Date().toISOString(),
        resolvedWinner: selectedWinner,
        resolvedReason: reason,
      });

      // Log operation
      await db.operations.put({
        operationId: generateUUID(),
        eventId: conflict.eventId,
        participantId: conflict.participantId,
        type: 'CONFLICT_RESOLVED',
        deviceId: operationService.getDeviceId(),
        operatorId: operationService.getOperator(),
        deviceTimestamp: new Date().toISOString(),
        payload: {
          conflictId: conflict.id,
          bibNumber: conflict.bibNumber,
          selectedWinner,
          discardedRecordId: discardedRecord.id,
          chosenRecordId: chosenRecord.id,
          chosenTime: chosenRecord.timestamp,
          reason,
        },
        syncStatus: 'LOCAL_ONLY',
        revision: 1,
      });

      await operationService.logAudit(
        'CONFLICT_RESOLVED',
        `Conflict voor bib #${conflict.bibNumber} opgelost: Registratie ${selectedWinner} gekozen (${chosenRecord.timestamp}). Reden: ${reason}`,
        conflict.participantId,
        conflict.bibNumber,
        reason
      );

      onResolved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Fout bij oplossen');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-red-500/40 rounded-xl shadow-2xl max-w-xl w-full text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-red-950/30 border-b border-red-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/40">
              <AlertOctagon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>⚠ CONFLICT GECONTROLEERD</span>
                <span className="text-xs bg-red-500 text-slate-950 px-2 py-0.5 rounded font-black">
                  Bib #{conflict.bibNumber}
                </span>
              </h2>
              <p className="text-xs text-red-200/80">
                Twee apparaten hebben een verschillende registratie ingediend
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

        {/* Comparison Cards */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-300">
            Kies welke registratie als de officiële waarheid behouden moet blijven. Beide records blijven in de onveranderlijke auditlog bewaard.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Record A */}
            <div
              onClick={() => setSelectedWinner('A')}
              className={`p-4 rounded-xl border cursor-pointer transition relative ${
                selectedWinner === 'A'
                  ? 'bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/40 shadow-lg'
                  : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                  Optie A ({recA.deviceId || 'Device A'})
                </span>
                {selectedWinner === 'A' && (
                  <span className="w-5 h-5 rounded-full bg-blue-500 text-slate-950 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                )}
              </div>
              <div className="text-xl font-mono font-bold text-white mb-1">
                {formatLocalTime(recA.timestamp, true)}
              </div>
              <div className="text-xs text-slate-400 space-y-0.5">
                <div>Operator: {recA.operatorId || 'Onbekend'}</div>
                <div>Status: {'type' in recA ? recA.type : 'SHOOTING'}</div>
              </div>
            </div>

            {/* Record B */}
            <div
              onClick={() => setSelectedWinner('B')}
              className={`p-4 rounded-xl border cursor-pointer transition relative ${
                selectedWinner === 'B'
                  ? 'bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/40 shadow-lg'
                  : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                  Optie B ({recB.deviceId || 'Device B'})
                </span>
                {selectedWinner === 'B' && (
                  <span className="w-5 h-5 rounded-full bg-blue-500 text-slate-950 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                )}
              </div>
              <div className="text-xl font-mono font-bold text-white mb-1">
                {formatLocalTime(recB.timestamp, true)}
              </div>
              <div className="text-xs text-slate-400 space-y-0.5">
                <div>Operator: {recB.operatorId || 'Onbekend'}</div>
                <div>Status: {'type' in recB ? recB.type : 'SHOOTING'}</div>
              </div>
            </div>
          </div>

          {/* Reason input */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Verplichte motivering wedstrijdleiding <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="bv. Optie A bevestigd door finishvideocamera of jurybeslissing"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
            {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-850 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
          >
            Later Beslissen
          </button>
          <button
            onClick={handleResolve}
            disabled={isSubmitting}
            className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg transition"
          >
            {isSubmitting ? 'Verwerken...' : 'Conflict Beslechten & Opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
};
