import React, { useState } from 'react';
import {
  Settings,
  X,
  Tv,
  Clock,
  RotateCw,
  Layers,
  Users,
  Sun,
  Moon,
  Monitor,
  Lock,
  Unlock,
  Play,
  CheckCircle2,
  AlertTriangle,
  Flame,
} from 'lucide-react';
import type {
  KioskConfig,
  RotationMode,
  RowsPerPageSetting,
  KioskStatusFilter,
  TextScaleSetting,
} from '../../services/kioskConfigService';
import { themeService, type AppTheme } from '../../services/themeService';
import type { Category } from '../../types';

interface KioskSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: KioskConfig;
  onUpdateConfig: (partial: Partial<KioskConfig>) => void;
  categories: Category[];
  profiles: [string, string][];
  isTestModeActive: boolean;
  onToggleTestMode: () => void;
  onExitKiosk: () => void;
}

export const KioskSettingsModal: React.FC<KioskSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  categories,
  profiles,
  isTestModeActive,
  onToggleTestMode,
  onExitKiosk,
}) => {
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => themeService.getTheme());
  const [newPin, setNewPin] = useState(config.pinLock || '');
  const [pinMessage, setPinMessage] = useState('');

  if (!isOpen) return null;

  const handleThemeChange = (t: AppTheme) => {
    setCurrentTheme(t);
    themeService.setTheme(t);
  };

  const handleSavePin = () => {
    onUpdateConfig({ pinLock: newPin });
    setPinMessage('Pincode bijgewerkt.');
    setTimeout(() => setPinMessage(''), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="p-4 bg-slate-850 border-b border-slate-750 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tv className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-base font-black text-white">Kiosk- & Scherminstellingen</h3>
              <p className="text-[11px] text-slate-400">
                Beheer rotatie, paginering, podium, thema en testmodus voor het resultatenscherm
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

        {/* Content Tabs / Sections */}
        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* FASE 9: Thema (Licht / Donker / Systeem) */}
          <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-750 space-y-2.5">
            <label className="text-xs font-bold text-white block">Weergavethema</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleThemeChange('dark')}
                className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition border ${
                  currentTheme === 'dark'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : 'bg-slate-850 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                <Moon className="w-4 h-4" /> Donker
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange('light')}
                className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition border ${
                  currentTheme === 'light'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : 'bg-slate-850 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                <Sun className="w-4 h-4" /> Licht
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange('system')}
                className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition border ${
                  currentTheme === 'system'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : 'bg-slate-850 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                <Monitor className="w-4 h-4" /> Systeem
              </button>
            </div>
          </div>

          {/* FASE 4: Rotatie van resultatenscherm */}
          <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-750 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold">
              <RotateCw className="w-4 h-4 text-amber-400" />
              <span>Rotatie van resultatenscherm</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Rotatiemodus</label>
                <select
                  value={config.rotateMode}
                  onChange={(e) => onUpdateConfig({ rotateMode: e.target.value as RotationMode })}
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold"
                >
                  <option value="NONE">Geen (statisch op huidig filter)</option>
                  <option value="CATEGORY">Leeftijdscategorieën roteren</option>
                  <option value="PROFILE">Wedstrijdprofielen roteren</option>
                  <option value="PROFILE_AND_CATEGORY">Profiel + Leeftijdscategorie</option>
                  <option value="ALL_COMBINATIONS">Alle actieve combinaties</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Rotatie-interval (wissel van categorie/profiel)
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={[5, 10, 15, 30, 60].includes(config.rotationSeconds) ? config.rotationSeconds : 'custom'}
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        onUpdateConfig({ rotationSeconds: Number(e.target.value) });
                      }
                    }}
                    className="w-1/2 bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold"
                  >
                    <option value={5}>5 seconden</option>
                    <option value={10}>10 seconden</option>
                    <option value={15}>15 seconden</option>
                    <option value={30}>30 seconden</option>
                    <option value={60}>60 seconden</option>
                    <option value="custom">Aangepast...</option>
                  </select>
                  {(![5, 10, 15, 30, 60].includes(config.rotationSeconds) || config.rotationSeconds > 60) && (
                    <input
                      type="number"
                      min={3}
                      max={300}
                      value={config.rotationSeconds}
                      onChange={(e) => onUpdateConfig({ rotationSeconds: Math.max(3, Number(e.target.value)) })}
                      className="w-1/2 bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                      placeholder="Seconden"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* FASE 5 & 6: Maximum deelnemers per pagina & Automatische paginering */}
          <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-750 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Deelnemers per pagina & Automatische Paginering</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Maximum deelnemers per pagina
                </label>
                <select
                  value={String(config.rowsPerPage)}
                  onChange={(e) => {
                    const val = e.target.value === 'AUTO' ? 'AUTO' : Number(e.target.value);
                    onUpdateConfig({ rowsPerPage: val as RowsPerPageSetting });
                  }}
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold"
                >
                  <option value="AUTO">Automatisch (past precies op schermhoogte)</option>
                  <option value="5">5 deelnemers</option>
                  <option value="10">10 deelnemers</option>
                  <option value="15">15 deelnemers</option>
                  <option value="20">20 deelnemers</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  'Automatisch' berekent hoeveel rijen comfortabel passen zonder verticale schuifbalk.
                </p>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Paginawissel interval (bij meerdere pagina's)
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={[5, 8, 10, 15].includes(config.pageSeconds) ? config.pageSeconds : 'custom'}
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        onUpdateConfig({ pageSeconds: Number(e.target.value) });
                      }
                    }}
                    className="w-1/2 bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold"
                  >
                    <option value={5}>5 seconden</option>
                    <option value={8}>8 seconden (aanbevolen)</option>
                    <option value={10}>10 seconden</option>
                    <option value={15}>15 seconden</option>
                    <option value="custom">Aangepast...</option>
                  </select>
                  {(![5, 8, 10, 15].includes(config.pageSeconds) || config.pageSeconds > 60) && (
                    <input
                      type="number"
                      min={3}
                      max={120}
                      value={config.pageSeconds}
                      onChange={(e) => onUpdateConfig({ pageSeconds: Math.max(3, Number(e.target.value)) })}
                      className="w-1/2 bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                      placeholder="Seconden"
                    />
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Toont eerst alle pagina's van een categorie alvorens door te roteren.
                </p>
              </div>
            </div>
          </div>

          {/* FASE 7 & 8: Weergave-opties (Podium, Klok, Tekstgrootte, Statusfilter) */}
          <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-750 space-y-3">
            <span className="font-bold text-white block">Weergave-opties op het scherm</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2.5 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showPodium}
                  onChange={(e) => onUpdateConfig({ showPodium: e.target.checked })}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-400"
                />
                <span>Podiumweergave bovenaan tonen (🥇 Goud, 🥈 Zilver, 🥉 Brons)</span>
              </label>

              <label className="flex items-center gap-2.5 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showClock}
                  onChange={(e) => onUpdateConfig({ showClock: e.target.checked })}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-400"
                />
                <span>Live Wedstrijdklok tonen</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Kiosk statusfilter</label>
                <select
                  value={config.statusFilter}
                  onChange={(e) => onUpdateConfig({ statusFilter: e.target.value as KioskStatusFilter })}
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold"
                >
                  <option value="ALL">Iedereen (Alle statussen)</option>
                  <option value="STARTED_AND_FINISHED">Gestart + Gefinisht</option>
                  <option value="FINISHED">Alleen Gefinisht</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Tekstgrootte (Afstand)</label>
                <select
                  value={config.textScale}
                  onChange={(e) => onUpdateConfig({ textScale: e.target.value as TextScaleSetting })}
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold"
                >
                  <option value="normal">Normaal (Monitoren / Laptops)</option>
                  <option value="large">Groot (1080p TV / Beamer)</option>
                  <option value="extra-large">Extra groot (4K Schermen / Publiek)</option>
                </select>
              </div>
            </div>
          </div>

          {/* FASE 11: Kiosk Testmodus */}
          <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-white text-xs">Kiosk Testmodus</span>
                {isTestModeActive && (
                  <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-black text-[10px] uppercase">
                    Actief
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Simuleer live rotatie, paginering en podium met 35 testatleten. Echte wedstrijduitslagen blijven ongewijzigd.
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleTestMode}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                isTestModeActive
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isTestModeActive ? 'Testmodus Stoppen' : 'Testmodus Starten'}</span>
            </button>
          </div>

          {/* Kiosk Vergrendeling (PIN) */}
          <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-750 space-y-2">
            <div className="flex items-center gap-2 text-white font-bold">
              <Lock className="w-4 h-4 text-amber-400" />
              <span>Kiosk Beveiliging & PIN-vergrendeling</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Voorkom dat toeschouwers de kiosk verlaten of instellingen wijzigen.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="password"
                placeholder="Pincode (optioneel)"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                maxLength={8}
                className="w-40 bg-slate-850 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-center tracking-widest"
              />
              <button
                type="button"
                onClick={handleSavePin}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-650 text-white font-semibold transition text-xs"
              >
                Opslaan
              </button>
              {pinMessage && <span className="text-emerald-400 text-xs font-semibold">{pinMessage}</span>}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-850 border-t border-slate-750 flex items-center justify-between">
          <button
            type="button"
            onClick={onExitKiosk}
            className="px-3.5 py-2 rounded-xl bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 text-xs font-semibold transition"
          >
            Kioskmodus verlaten
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow transition"
          >
            Instellingen sluiten
          </button>
        </div>
      </div>
    </div>
  );
};
