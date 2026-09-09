import { DevicePairingPanel } from './components/DevicePairingPanel';
import React, { useState } from 'react';
import { useEventData } from './hooks/useEventData';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { Header } from './components/Header';
import { Navigation, getLockedTabForRole, type ActiveTab } from './components/Navigation';

// Views
import { EventDashboardView } from './components/views/EventDashboardView';
import { StartStationView } from './components/views/StartStationView';
import { ShootingStationView } from './components/views/ShootingStationView';
import { FinishStationView } from './components/views/FinishStationView';
import { LiveLeaderboardView } from './components/views/LiveLeaderboardView';
import { ParticipantsView } from './components/views/ParticipantsView';
import { WavesView } from './components/views/WavesView';
import { AttentionView } from './components/views/AttentionView';
import { SettingsView } from './components/views/SettingsView';

// Modals
import { PreRaceCheckModal } from './components/PreRaceCheckModal';
import { PrintModal } from './components/PrintModal';
import { ConflictResolverModal } from './components/ConflictResolverModal';
import { ParticipantDetailModal } from './components/ParticipantDetailModal';

import type { RaceConflict, Participant, RaceResult } from './types';
import { AlertTriangle } from 'lucide-react';
import { db } from './db/dexieDb';

const validTabs = new Set<ActiveTab>([
  'event', 'participants', 'waves', 'start', 'shooting', 'finish',
  'live', 'results', 'attention', 'settings',
]);

const getInitialTab = (): ActiveTab => {
  if (typeof window === 'undefined') return 'event';
  const hashTab = window.location.hash.replace(/^#/, '') as ActiveTab;
  return validTabs.has(hashTab) ? hashTab : 'event';
};

export default function App() {
  const {
    event,
    participants,
    categories,
    waves,
    raceProfiles,
    timingRecords,
    shootingResults,
    results,
    conflicts,
    auditLogs,
    deviceConfig,
    pendingSyncCount,
    refresh,
    loading,
  } = useEventData();

  const { isSimulatedOffline, toggleSimulatedOffline } = useOnlineStatus();
  const [currentTab, setCurrentTab] = useState<ActiveTab>(getInitialTab);
  const [joinLink, setJoinLink] = useState(() => location.hash.startsWith('#join=') ? location.href : '');
  const [isLeaderboardKiosk, setIsLeaderboardKiosk] = useState(false);

  // Modals state
  const [showPreRaceModal, setShowPreRaceModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [activeConflict, setActiveConflict] = useState<RaceConflict | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);

  const unresolvedConflictsCount = conflicts.filter((c) => !c.resolvedAt).length;
  const activeTimingRecords = timingRecords.filter((record) => !record.isReversed);
  const unknownBibCount = activeTimingRecords.filter((record) => record.isUnknownBib).length;
  const startedBibs = new Set(
    activeTimingRecords.filter((record) => record.type === 'START').map((record) => record.bibNumber)
  );
  const finishedBibs = new Set(
    activeTimingRecords.filter((record) => record.type === 'FINISH').map((record) => record.bibNumber)
  );
  const shootingBibs = new Set(shootingResults.map((result) => result.bibNumber));
  const missingStartCount = [...finishedBibs].filter((bib) => !startedBibs.has(bib)).length;
  const missingShootingCount = [...finishedBibs].filter((bib) => !shootingBibs.has(bib)).length;
  const attentionCount = unknownBibCount + missingStartCount + missingShootingCount;
  const lockedTab = deviceConfig?.isLocked ? getLockedTabForRole(deviceConfig.role) : null;
  const displayedTab = lockedTab || currentTab;

  React.useEffect(() => {
    if (deviceConfig?.isLocked) {
      setCurrentTab(getLockedTabForRole(deviceConfig.role));
    }
  }, [deviceConfig?.isLocked, deviceConfig?.role]);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash.startsWith('#join=')) return;
      const nextHash = `#${currentTab}`;
      if (window.location.hash !== nextHash) {
        window.history.pushState(null, '', nextHash);
      }
    }
  }, [currentTab]);

  React.useEffect(() => {
    const restoreTabFromHistory = () => {
      if (window.location.hash.startsWith('#join=')) { setJoinLink(window.location.href); return; }
      const hashTab = window.location.hash.replace(/^#/, '') as ActiveTab;
      if (validTabs.has(hashTab)) setCurrentTab(hashTab);
    };
    window.addEventListener('popstate', restoreTabFromHistory);
    window.addEventListener('hashchange', restoreTabFromHistory);
    return () => {
      window.removeEventListener('popstate', restoreTabFromHistory);
      window.removeEventListener('hashchange', restoreTabFromHistory);
    };
  }, []);

  const handleUnlockDevice = async () => {
    if (!deviceConfig?.isLocked) return;
    if (deviceConfig.pin) {
      const enteredPin = window.prompt('Voer de beheerderscode in om dit toestel te ontgrendelen:');
      if (enteredPin === null) return;
      if (enteredPin !== deviceConfig.pin) {
        window.alert('Onjuiste beheerderscode. Het toestel blijft vergrendeld.');
        return;
      }
    } else if (!window.confirm('Wilt u dit toestel ontgrendelen en alle menu’s opnieuw tonen?')) {
      return;
    }

    await db.devices.update(deviceConfig.id, { isLocked: false });
    await refresh();
    setCurrentTab('event');
  };

  const handleSelectParticipantFromResult = (result: RaceResult) => {
    const p = participants.find((item) => item.id === result.participantId);
    if (p) setSelectedParticipant(p);
  };

  if (loading && !event) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 space-y-3">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-semibold tracking-wider font-mono">
          Biathlon Tijdregistratie laden...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950">
      {joinLink && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm overflow-auto p-4 sm:p-6 flex items-start justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setJoinLink('');
              history.replaceState(null, '', location.pathname);
            }
          }}
        >
          <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl relative my-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Toestelkoppeling</span>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition"
                onClick={() => {
                  setJoinLink('');
                  history.replaceState(null, '', location.pathname);
                }}
              >
                Sluiten ✕
              </button>
            </div>
            <DevicePairingPanel initialLink={joinLink} onJoined={() => { setJoinLink(''); location.reload(); }} />
          </div>
        </div>
      )}
      {/* Test Mode / Simulated Offline Banner */}
      {!isLeaderboardKiosk && (event?.isTestMode || isSimulatedOffline) && (
        <div className="bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-black uppercase tracking-wider flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
            <span>
              {isSimulatedOffline
                ? 'GEFORCEERDE OFFLINE MODUS ACTIEF: Apparaat opereert 100% autonoom op lokale IndexedDB'
                : `TESTMODUS: ${event?.name || 'Biathlon Tijdregistratie'} Testset actief`}
            </span>
          </div>
          {isSimulatedOffline && (
            <button
              onClick={toggleSimulatedOffline}
              className="bg-slate-950 text-amber-400 px-2 py-0.5 rounded text-[10px] font-bold hover:bg-slate-900 transition"
            >
              Hervat Netwerk
            </button>
          )}
        </div>
      )}

      {!isLeaderboardKiosk && <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <Header
          stationNavigation={<Navigation variant="stations" activeTab={displayedTab} onSelectTab={setCurrentTab} conflictCount={unresolvedConflictsCount} attentionCount={attentionCount} deviceConfig={deviceConfig} />}
          event={event}
          deviceConfig={deviceConfig}
          pendingSyncCount={pendingSyncCount}
          onOpenPreRaceCheck={() => setShowPreRaceModal(true)}
          onOpenPrint={() => setShowPrintModal(true)}
          onUnlockDevice={handleUnlockDevice}
          isTestMode={event?.isTestMode ?? false}
        />
        <Navigation
          activeTab={displayedTab}
          onSelectTab={setCurrentTab}
          conflictCount={unresolvedConflictsCount}
          attentionCount={attentionCount}
          deviceConfig={deviceConfig}
        />
      </div>}

      {/* Main Content View */}
      <main className={isLeaderboardKiosk
        ? 'flex-1 w-full'
        : 'flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-16'}>
        {displayedTab === 'event' && (
          <EventDashboardView
            event={event}
            participants={participants}
            waves={waves}
            timingRecords={timingRecords}
            shootingResults={shootingResults}
            results={results}
            conflicts={conflicts}
            onNavigate={setCurrentTab}
            onOpenPreRaceCheck={() => setShowPreRaceModal(true)}
          />
        )}

        {displayedTab === 'start' && (
          <StartStationView
            categories={categories}
            waves={waves}
            participants={participants}
            timingRecords={timingRecords}
            onRefresh={refresh}
          />
        )}

        {displayedTab === 'shooting' && (
          <ShootingStationView
            categories={categories}
            event={event}
            participants={participants}
            shootingResults={shootingResults}
            raceProfiles={raceProfiles}
            onRefresh={refresh}
          />
        )}

        {displayedTab === 'finish' && (
          <FinishStationView
            categories={categories}
            waves={waves}
            event={event}
            participants={participants}
            timingRecords={timingRecords}
            onRefresh={refresh}
          />
        )}

        {(displayedTab === 'live' || displayedTab === 'results') && (
          <LiveLeaderboardView
            key={event?.id}
            results={results}
            categories={categories}
            waves={waves}
            event={event}
            mode={displayedTab === 'results' ? 'results' : 'live'}
            onSelectParticipant={handleSelectParticipantFromResult}
            onKioskModeChange={setIsLeaderboardKiosk}
          />
        )}

        {displayedTab === 'participants' && (
          <ParticipantsView
            participants={participants}
            categories={categories}
            waves={waves}
            profiles={raceProfiles}
            onRefresh={refresh}
            onSelectParticipant={setSelectedParticipant}
          />
        )}

        {displayedTab === 'waves' && (
          <WavesView
            waves={waves}
            categories={categories}
            participants={participants}
            onRefresh={refresh}
          />
        )}

        {displayedTab === 'attention' && (
          <AttentionView
            conflicts={conflicts}
            participants={participants}
            timingRecords={timingRecords}
            shootingResults={shootingResults}
            auditLogs={auditLogs}
            onOpenConflict={setActiveConflict}
            onSelectParticipant={setSelectedParticipant}
          />
        )}

        {displayedTab === 'settings' && (
          <SettingsView
            event={event}
            deviceConfig={deviceConfig}
            profiles={raceProfiles}
            categories={categories}
            waves={waves}
            participants={participants}
            onRefresh={refresh}
          />
        )}
      </main>

      {/* Global Modals */}
      <PreRaceCheckModal
        isOpen={showPreRaceModal}
        onClose={() => setShowPreRaceModal(false)}
        event={event}
        participants={participants}
        waves={waves}
        categories={categories}
        profiles={raceProfiles}
        conflicts={conflicts}
        pendingSyncCount={pendingSyncCount}
        onGoLiveSuccess={refresh}
      />

      <PrintModal
        profiles={raceProfiles}
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        participants={participants}
        categories={categories}
        waves={waves}
        event={event}
      />

      <ConflictResolverModal
        isOpen={!!activeConflict}
        conflict={activeConflict}
        onClose={() => setActiveConflict(null)}
        onResolved={refresh}
      />

      <ParticipantDetailModal
        isOpen={!!selectedParticipant}
        participant={selectedParticipant}
        result={selectedParticipant ? results.find((r) => r.participantId === selectedParticipant.id) || null : null}
        auditLogs={auditLogs}
        timingRecords={timingRecords}
        shootingResults={shootingResults}
        categories={categories}
        waves={waves}
        profiles={raceProfiles}
        onClose={() => setSelectedParticipant(null)}
        onUpdated={refresh}
      />
    </div>
  );
}
