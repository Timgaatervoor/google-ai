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
  icon: React.ComponentType<{ className?: string }>;
  color?: 'emerald' | 'blue' | 'amber';
}

const tabConfig: Record<ActiveTab, TabConfig> = {
  event: { label: 'Overzicht', icon: LayoutDashboard },
  participants: { label: 'Deelnemers', icon: Users },
  waves: { label: 'Startgroepen', icon: Layers },
  start: { label: 'Start', icon: PlayCircle, color: 'emerald' },
  shooting: { label: 'Schieten', icon: Crosshair, color: 'blue' },
  finish: { label: 'Finish', icon: Flag, color: 'amber' },
  live: { label: 'Live uitslagen', icon: Activity },
  results: { label: 'Einduitslagen', icon: Trophy },
  attention: { label: 'Controle', icon: AlertTriangle },
  settings: { label: 'Instellingen', icon: Settings },
};

const standardButtonClasses = (active: boolean) =>
  `flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
    active
      ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700'
      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
  }`;

const operationButtonClasses = (tab: ActiveTab, active: boolean) => {
  const color = tabConfig[tab].color;
  if (color === 'emerald') {
    return active
      ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30'
      : 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900/60';
  }
  if (color === 'blue') {
    return active
      ? 'bg-blue-500 text-slate-950 shadow-lg shadow-blue-500/30'
      : 'bg-blue-950/40 text-blue-300 border border-blue-500/40 hover:bg-blue-900/60';
  }
  return active
    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
    : 'bg-amber-950/40 text-amber-300 border border-amber-500/40 hover:bg-amber-900/60';
};

export const Navigation: React.FC<NavigationProps> = ({
  variant = 'sections',
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
        type="button"
        onClick={() => onSelectTab(tab)}
        aria-current={isActive ? 'page' : undefined}
        className={
          operation
            ? `flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition ${operationButtonClasses(tab, isActive)}`
            : standardButtonClasses(isActive)
        }
      >
        <Icon className={`w-4 h-4 ${!operation && isActive ? 'text-amber-400' : ''}`} />
        <span>{item.label}</span>
        {tab === 'attention' && problemCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black text-white bg-red-500">
            {problemCount}
          </span>
        )}
      </button>
    );
  };

  if (lockedTab) {
    if (variant === 'sections') return null;
    return <nav aria-label="Vergrendelde postnavigatie" className="flex flex-wrap items-center gap-2">
      {renderTabButton(lockedTab, ['start', 'shooting', 'finish'].includes(lockedTab))}
      <Lock aria-label="Toestel vergrendeld voor deze post" className="w-4 h-4 text-amber-300" />
    </nav>;
  }
  if (variant === 'stations') return <nav aria-label="Wedstrijdregistratie" className="flex items-center gap-1.5 shrink-0">
    {renderTabButton('start', true)}
    {renderTabButton('shooting', true)}
    {renderTabButton('finish', true)}
  </nav>;

  return <nav aria-label="Hoofdnavigatie" className="border-t border-slate-800">
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center gap-1.5">
      {renderTabButton('event')}
      {renderTabButton('participants')}
      {renderTabButton('waves')}
      <span className="hidden sm:block w-px h-5 bg-slate-700 mx-1" aria-hidden="true" />
      {renderTabButton('live')}
      {renderTabButton('results')}
      {renderTabButton('attention')}
      {renderTabButton('settings')}
    </div>
  </nav>;
};
