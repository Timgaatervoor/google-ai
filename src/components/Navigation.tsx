import React from 'react';
import {
  LayoutDashboard,
  Users,
  Layers,
  PlayCircle,
  Crosshair,
  Flag,
  Activity,
  Trophy,
  AlertTriangle,
  Settings,
  Lock,
} from 'lucide-react';
import type { DeviceConfig, UserRole } from '../types';

export type ActiveTab =
  | 'event'
  | 'participants'
  | 'waves'
  | 'start'
  | 'shooting'
  | 'finish'
  | 'live'
  | 'results'
  | 'attention'
  | 'settings';

interface NavigationProps {
  variant?: 'stations' | 'sections';
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  conflictCount: number;
  attentionCount: number;
  deviceConfig: DeviceConfig | null;
}

const lockedTabByRole: Record<UserRole, ActiveTab> = {
  ADMIN: 'event',
  RACE_DIRECTOR: 'event',
  REGISTRATION: 'participants',
  START_OPERATOR: 'start',
  SHOOTING_OPERATOR: 'shooting',
  FINISH_OPERATOR: 'finish',
  VIEWER: 'live',
};

export const getLockedTabForRole = (role: UserRole): ActiveTab => lockedTabByRole[role];

interface TabConfig {
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: 'emerald' | 'blue' | 'amber';
  badgeType?: 'alert';
}

const tabConfig: Record<ActiveTab, TabConfig> = {
  event: { label: 'Overzicht', shortLabel: 'Overzicht', icon: LayoutDashboard },
  participants: { label: 'Deelnemers', shortLabel: 'Deelnemers', icon: Users },
  waves: { label: 'Startgroepen', shortLabel: 'Groepen', icon: Layers },
  start: { label: 'Startpost', shortLabel: 'Start', icon: PlayCircle, color: 'emerald' },
  shooting: { label: 'Schietstand', shortLabel: 'Schieten', icon: Crosshair, color: 'blue' },
  finish: { label: 'Finishpost', shortLabel: 'Finish', icon: Flag, color: 'amber' },
  live: { label: 'Live Monitor', shortLabel: 'Live', icon: Activity },
  results: { label: 'Einduitslagen', shortLabel: 'Uitslagen', icon: Trophy },
  attention: { label: 'Controlepost', shortLabel: 'Controle', icon: AlertTriangle, badgeType: 'alert' },
  settings: { label: 'Instellingen', shortLabel: 'Instellingen', icon: Settings },
};

const standardButtonClasses = (active: boolean) =>
  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
    active
      ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700'
      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
  }`;

const operationButtonClasses = (tab: ActiveTab, active: boolean) => {
  const color = tabConfig[tab].color;
  if (color === 'emerald') {
    return active
      ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/30'
      : 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900/60 font-bold';
  }
  if (color === 'blue') {
    return active
      ? 'bg-blue-500 text-slate-950 font-black shadow-md shadow-blue-500/30'
      : 'bg-blue-950/40 text-blue-300 border border-blue-500/40 hover:bg-blue-900/60 font-bold';
  }
  return active
    ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/30'
    : 'bg-amber-950/40 text-amber-300 border border-amber-500/40 hover:bg-amber-900/60 font-bold';
};

export const Navigation: React.FC<NavigationProps> = ({
  variant = 'full',
  activeTab,
  onSelectTab,
  conflictCount,
  attentionCount,
  deviceConfig,
}) => {
  const problemCount = conflictCount + attentionCount;
  const lockedTab = deviceConfig?.isLocked ? getLockedTabForRole(deviceConfig.role) : null;

  const renderTabButton = (tab: ActiveTab, operation = false) => {
    const item = tabConfig[tab];
    const Icon = item.icon;
    const isActive = activeTab === tab;
    return (
      <button
        key={tab}
        id={`nav-tab-${tab}`}
        type="button"
        onClick={() => onSelectTab(tab)}
        aria-current={isActive ? 'page' : undefined}
        className={
          operation
            ? `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs uppercase tracking-wider transition whitespace-nowrap ${operationButtonClasses(
                tab,
                isActive
              )}`
            : standardButtonClasses(isActive)
        }
      >
        <Icon className={`w-4 h-4 shrink-0 ${!operation && isActive ? 'text-amber-400' : ''}`} />
        <span className="hidden sm:inline">{item.label}</span>
        <span className="sm:hidden">{item.shortLabel || item.label}</span>
        {tab === 'attention' && problemCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black text-white bg-red-500 animate-pulse">
            {problemCount}
          </span>
        )}
      </button>
    );
  };

  if (lockedTab) {
    if (variant === 'stations') return null;
    return (
      <nav aria-label="Vergrendelde postnavigatie" className="bg-slate-900/80 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {renderTabButton(lockedTab, ['start', 'shooting', 'finish'].includes(lockedTab))}
            <div className="flex items-center gap-1.5 text-xs text-amber-300/90 font-medium">
              <Lock className="w-3.5 h-3.5" />
              <span>Toestel vergrendeld voor deze post (ontgrendel via de bovenbalk)</span>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // Legacy fallback if stations variant explicitly requested
  if (variant === 'stations') {
    return (
      <nav aria-label="Wedstrijdregistratie" className="flex items-center gap-1.5 shrink-0">
        {renderTabButton('start', true)}
        {renderTabButton('shooting', true)}
        {renderTabButton('finish', true)}
      </nav>
    );
  }

  return (
    <nav
      id="main-navigation-bar"
      aria-label="Hoofdnavigatie biathlon wedstrijd"
      className="border-t border-slate-800/80 bg-slate-900/90 backdrop-blur-sm shadow-sm"
    >
      <div className="max-w-7xl mx-auto px-2 sm:px-6 py-2 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        {/* Groep 1: Organisatie & Voorbereiding */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="hidden xl:inline text-[10px] uppercase font-bold text-slate-500 tracking-wider mr-1 select-none">
            Organisatie:
          </span>
          {renderTabButton('event')}
          {renderTabButton('participants')}
          {renderTabButton('waves')}
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-slate-800 shrink-0 mx-1" aria-hidden="true" />

        {/* Groep 2: Wedstrijdposten (Tijdregistratie) */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="hidden xl:inline text-[10px] uppercase font-bold text-slate-500 tracking-wider mr-1 select-none">
            Posten:
          </span>
          {renderTabButton('start', true)}
          {renderTabButton('shooting', true)}
          {renderTabButton('finish', true)}
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-slate-800 shrink-0 mx-1" aria-hidden="true" />

        {/* Groep 3: Uitslagen & Kiosk */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="hidden xl:inline text-[10px] uppercase font-bold text-slate-500 tracking-wider mr-1 select-none">
            Uitslag:
          </span>
          {renderTabButton('live')}
          {renderTabButton('results')}
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-slate-800 shrink-0 mx-1" aria-hidden="true" />

        {/* Groep 4: Beheer & Integriteit */}
        <div className="flex items-center gap-1 shrink-0">
          {renderTabButton('attention')}
          {renderTabButton('settings')}
        </div>
      </div>
    </nav>
  );
};
