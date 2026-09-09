import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { soundService } from '../services/soundService';

export interface SafeConfirmButtonProps {
  /** The standard label on the button before activation */
  label: string;
  /** Custom icon to render */
  icon?: React.ReactNode;
  /** Action performed upon full confirmation */
  onConfirm: () => Promise<void> | void;
  /** Success message to display briefly after completion */
  successMessage?: string;
  /** Prompt description shown in confirmation mode */
  confirmPrompt?: string;
  /** Extra confirmation dialog for critical actions like factory/database reset */
  requireDialog?: boolean;
  /** Dialog title if requireDialog is true */
  dialogTitle?: string;
  /** Dialog description if requireDialog is true */
  dialogDescription?: string;
  /** Visual variant */
  variant?: 'danger' | 'warning' | 'amber' | 'neutral';
  /** CSS class overrides */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Identifier for DOM / testing */
  id?: string;
}

export const SafeConfirmButton: React.FC<SafeConfirmButtonProps> = ({
  label,
  icon,
  onConfirm,
  successMessage = 'Actie succesvol uitgevoerd.',
  confirmPrompt = 'Klik om te bevestigen (of houd 3s vast)',
  requireDialog = false,
  dialogTitle = 'Definitieve bevestiging vereist',
  dialogDescription = 'Weet u zeker dat u deze actie wilt uitvoeren? Deze bewerking kan niet ongedaan worden gemaakt.',
  variant = 'danger',
  className = '',
  disabled = false,
  id,
}) => {
  const [stage, setStage] = useState<'idle' | 'armed' | 'holding' | 'dialog' | 'executing' | 'success'>('idle');
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(3);
  const [dialogInput, setDialogInput] = useState<string>('');

  const holdStartRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const autoRevertTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isExecutingRef = useRef<boolean>(false);
  const pointerDownTimeRef = useRef<number>(0);

  const HOLD_DURATION_MS = 3000;

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (autoRevertTimerRef.current) clearTimeout(autoRevertTimerRef.current);
    };
  }, []);

  const resetState = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (autoRevertTimerRef.current) {
      clearTimeout(autoRevertTimerRef.current);
      autoRevertTimerRef.current = null;
    }
    holdStartRef.current = null;
    pointerDownTimeRef.current = 0;
    setHoldProgress(0);
    setSecondsRemaining(3);
    setDialogInput('');
    setStage('idle');
  }, []);

  // When entering armed mode, automatically revert back after 12s if user abandons
  useEffect(() => {
    if (stage === 'armed') {
      autoRevertTimerRef.current = setTimeout(() => {
        resetState();
      }, 12000);
      return () => {
        if (autoRevertTimerRef.current) clearTimeout(autoRevertTimerRef.current);
      };
    }
  }, [stage, resetState]);

  const executeAction = async () => {
    if (isExecutingRef.current) return;
    isExecutingRef.current = true;
    setStage('executing');
    try {
      await onConfirm();
      soundService.playSuccess();
      setStage('success');
      setTimeout(() => {
        isExecutingRef.current = false;
        resetState();
      }, 2000);
    } catch (err) {
      console.error('Fout bij uitvoeren van actie:', err);
      isExecutingRef.current = false;
      soundService.playError();
      setStage('armed');
      alert(`Actie mislukt: ${err instanceof Error ? err.message : 'Onbekende fout'}`);
    }
  };

  const handleConfirmTrigger = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    holdStartRef.current = null;
    setHoldProgress(100);
    setSecondsRemaining(0);

    if (requireDialog) {
      setStage('dialog');
    } else {
      void executeAction();
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || isExecutingRef.current || stage === 'executing' || stage === 'success') return;

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore if pointer capture not supported
    }

    pointerDownTimeRef.current = performance.now();
    const startTime = performance.now();
    holdStartRef.current = startTime;
    setStage('holding');

    const tick = (now: number) => {
      if (!holdStartRef.current) return;
      const elapsed = now - holdStartRef.current;
      const progress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      const remainingSec = Math.max(0, Math.ceil((HOLD_DURATION_MS - elapsed) / 1000));

      setHoldProgress(progress);
      setSecondsRemaining(remainingSec);

      if (elapsed >= HOLD_DURATION_MS) {
        handleConfirmTrigger();
      } else {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(tick);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }

    if (stage === 'holding') {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      holdStartRef.current = null;

      // When armed and pressed/clicked, confirm immediately upon release or click
      if (!isExecutingRef.current) {
        handleConfirmTrigger();
      }
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    if (stage === 'holding') {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      holdStartRef.current = null;
      setHoldProgress(0);
      setSecondsRemaining(3);
      setStage('armed');
    }
  };

  const handleArmClick = () => {
    soundService.playWarning();
    setStage('armed');
  };

  // Variant color mapping
  const variantStyles = {
    danger: {
      idle: 'bg-red-950/50 hover:bg-red-900/60 text-red-300 border-red-800/60 active:scale-98',
      armed: 'bg-red-600 hover:bg-red-500 text-white border-red-400 shadow-lg shadow-red-950/60',
      bar: 'bg-red-400',
    },
    warning: {
      idle: 'bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border-amber-800/60 active:scale-98',
      armed: 'bg-amber-600 hover:bg-amber-500 text-slate-950 font-black border-amber-300 shadow-lg shadow-amber-950/60',
      bar: 'bg-amber-300',
    },
    amber: {
      idle: 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40 active:scale-98',
      armed: 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black border-amber-300 shadow-lg shadow-amber-950/60',
      bar: 'bg-amber-300',
    },
    neutral: {
      idle: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 active:scale-98',
      armed: 'bg-red-600 hover:bg-red-500 text-white border-red-400 shadow-lg shadow-slate-950/60',
      bar: 'bg-red-400',
    },
  }[variant];

  return (
    <>
      {stage === 'idle' && (
        <button
          type="button"
          id={id}
          disabled={disabled}
          onClick={handleArmClick}
          className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition select-none disabled:opacity-40 disabled:cursor-not-allowed ${variantStyles.idle} ${className}`}
        >
          {icon}
          <span>{label}</span>
        </button>
      )}

      {(stage === 'armed' || stage === 'holding') && (
        <div className="flex items-center gap-1.5 w-full animate-in fade-in duration-150">
          <button
            type="button"
            id={id ? `${id}-confirm` : undefined}
            disabled={disabled}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onClick={(e) => {
              e.preventDefault();
              if (!isExecutingRef.current) handleConfirmTrigger();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleConfirmTrigger();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                resetState();
              }
            }}
            className={`relative overflow-hidden flex-1 flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition select-none cursor-pointer touch-none active:scale-[0.99] ${variantStyles.armed} ${className}`}
            title="Klik om direct te bevestigen of houd 3 seconden vast"
          >
            {/* Smooth background progress bar filling from left to right while holding */}
            <div
              className={`absolute top-0 bottom-0 left-0 transition-[width] duration-75 ease-linear pointer-events-none ${variantStyles.bar} opacity-40`}
              style={{ width: `${holdProgress}%` }}
            />

            <span className="relative z-10 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 animate-pulse shrink-0" />
              {stage === 'holding' ? (
                <span>
                  Vastgehouden... <strong className="font-mono font-bold">({secondsRemaining}s)</strong>
                </span>
              ) : (
                <span>{confirmPrompt}</span>
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={resetState}
            className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition active:scale-95 shrink-0"
            title="Annuleren (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {stage === 'executing' && (
        <div className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold opacity-80 cursor-wait ${variantStyles.armed} ${className}`}>
          <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
          <span>Bezig met uitvoeren...</span>
        </div>
      )}

      {stage === 'success' && (
        <div className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-950 border border-emerald-600 text-emerald-300 text-xs font-bold animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Extra high-impact confirmation modal for factory/database reset */}
      {stage === 'dialog' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-red-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="p-2 rounded-xl bg-red-500/20 text-red-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">{dialogTitle}</h3>
                <p className="text-xs text-red-400 font-semibold">Onomkeerbare bewerking</p>
              </div>
            </div>

            <p className="text-slate-300 leading-relaxed">{dialogDescription}</p>

            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
              <p className="text-slate-400 text-[11px]">
                Typ ter bevestiging <strong className="text-white select-all font-mono">BEVESTIG</strong> hieronder:
              </p>
              <input
                type="text"
                autoFocus
                value={dialogInput}
                onChange={(e) => setDialogInput(e.target.value)}
                placeholder="BEVESTIG"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold text-center uppercase tracking-widest focus:border-red-500 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={resetState}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
              >
                Annuleren
              </button>
              <button
                type="button"
                disabled={dialogInput.trim().toUpperCase() !== 'BEVESTIG'}
                onClick={() => {
                  void executeAction();
                }}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed transition shadow-lg shadow-red-950"
              >
                Definitief wissen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

