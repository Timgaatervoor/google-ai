import React, { useEffect, useState, useRef, useMemo } from 'react';
import './LiveLeaderboardView.css';
import {
  Trophy,
  Search,
  Filter,
  Medal,
  Tv,
  Lock,
  Unlock,
  Download,
  Crosshair,
  Flag,
  Settings,
  Clock,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  AlertTriangle,
  Play,
  RotateCw,
} from 'lucide-react';
import type { RaceResult, Category, Wave, RaceEvent, ParticipantStatus } from '../../types';
import { raceClock } from '../../services/raceClock';
import { formatDuration } from '../../services/timingEngine';
import { downloadCsvFile } from '../../services/backupService';
import {
  kioskConfigService,
  type KioskConfig,
  type RotationMode,
} from '../../services/kioskConfigService';
import { generateKioskTestData } from '../../services/kioskTestService';
import { KioskSettingsModal } from './KioskSettingsModal';

interface LiveLeaderboardViewProps {
  results: RaceResult[];
  categories: Category[];
  waves: Wave[];
  event: RaceEvent | null;
  mode?: 'live' | 'results';
  onSelectParticipant: (result: RaceResult) => void;
  onKioskModeChange?: (isKioskMode: boolean) => void;
}

export const LiveLeaderboardView: React.FC<LiveLeaderboardViewProps> = ({
  results: initialResults,
  categories: initialCategories,
  waves: initialWaves,
  event,
  mode = 'live',
  onSelectParticipant,
  onKioskModeChange,
}) => {
  // Test Mode simulation state
  const [isTestModeActive, setIsTestModeActive] = useState(false);
  const testData = useMemo(() => (isTestModeActive ? generateKioskTestData() : null), [isTestModeActive]);

  const results = testData ? testData.results : initialResults;
  const categories = testData ? testData.categories : initialCategories;
  const waves = testData ? testData.waves : initialWaves;

  // Kiosk Configuration state from persistent service
  const [kioskConfig, setKioskConfig] = useState<KioskConfig>(() => kioskConfigService.getConfig());
  useEffect(() => {
    return kioskConfigService.subscribe(setKioskConfig);
  }, []);

  const handleUpdateConfig = (partial: Partial<KioskConfig>) => {
    kioskConfigService.updateConfig(partial);
  };

  // Profile options: FASE 3 adds "ALL" ("Alle wedstrijdprofielen")
  const rawProfiles = useMemo(() => {
    const map = new Map<string, string>();
    results.forEach((r) => {
      if (r.raceProfileId) {
        map.set(r.raceProfileId, r.raceProfileName || 'Standaard');
      }
    });
    return Array.from(map.entries());
  }, [results]);

  const profileOptions: [string, string][] = useMemo(() => {
    return [
      ['ALL', 'Alle profielen (Totaal)'],
      ...rawProfiles,
    ];
  }, [rawProfiles]);

  const [selectedProfile, setSelectedProfile] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('biathlon_active_profile');
      if (saved) return saved;
    }
    return 'ALL';
  });

  const activeProfile = profileOptions.some(([id]) => id === selectedProfile)
    ? selectedProfile
    : 'ALL';

  const handleSelectProfile = (newProf: string) => {
    setSelectedProfile(newProf);
    if (typeof window !== 'undefined') {
      localStorage.setItem('biathlon_active_profile', newProf);
    }
    setCurrentPage(1);
  };

  // Category and filter state
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedWave, setSelectedWave] = useState<string>('ALL');
  const [selectedGender, setSelectedGender] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ParticipantStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Kiosk & UI state
  const [isKioskMode, setIsKioskMode] = useState<boolean>(false);
  const [showKioskSettings, setShowKioskSettings] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date(raceClock.nowMs()));
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinPendingAction, setPinPendingAction] = useState<'settings' | 'exit' | null>(null);

  // Pagination state (FASE 5 & 6)
  const [currentPage, setCurrentPage] = useState(1);
  const [containerHeight, setContainerHeight] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure container height for 'AUTO' rows per page
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 100) {
          setContainerHeight(entry.contentRect.height);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute effective rows per page
  const autoRowsCount = useMemo(() => {
    // In Kiosk mode, podium uses ~160px if visible, headers ~140px, pagination ~40px.
    const podiumDeduction = kioskConfig.showPodium ? 150 : 0;
    const available = Math.max(200, (isKioskMode ? window.innerHeight : containerHeight) - 220 - podiumDeduction);
    const rowHeight = kioskConfig.textScale === 'extra-large' ? 64 : kioskConfig.textScale === 'large' ? 52 : 44;
    return Math.max(4, Math.floor(available / rowHeight));
  }, [containerHeight, isKioskMode, kioskConfig.showPodium, kioskConfig.textScale]);

  const effectivePageSize = kioskConfig.rowsPerPage === 'AUTO' ? autoRowsCount : Number(kioskConfig.rowsPerPage);

  // Filtered results
  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      // Profile filter (FASE 3: 'ALL' includes all profiles)
      if (activeProfile !== 'ALL' && (r.raceProfileId ?? '') !== activeProfile) {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'ALL' && r.categoryId !== selectedCategory) {
        return false;
      }

      // Wave filter
      if (selectedWave !== 'ALL' && r.waveId !== selectedWave) {
        return false;
      }

      // Gender filter
      if (selectedGender !== 'ALL' && r.gender !== selectedGender) {
        return false;
      }

      // Status filter
      if (isKioskMode) {
        if (kioskConfig.statusFilter === 'FINISHED' && r.status !== 'FINISHED') return false;
        if (
          kioskConfig.statusFilter === 'STARTED_AND_FINISHED' &&
          r.status !== 'STARTED' &&
          r.status !== 'FINISHED'
        )
          return false;
      } else if (statusFilter !== 'ALL' && r.status !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = r.name.toLowerCase().includes(q);
        const matchBib = String(r.bibNumber || '').includes(q);
        const matchClub = (r.club || '').toLowerCase().includes(q);
        if (!matchName && !matchBib && !matchClub) return false;
      }

      return true;
    });
  }, [
    results,
    activeProfile,
    selectedCategory,
    selectedWave,
    selectedGender,
    isKioskMode,
    kioskConfig.statusFilter,
    statusFilter,
    searchQuery,
  ]);

  // Ranking calculation
  const ranked = useMemo(() => {
    return results
      .filter((r) => {
        if (r.status !== 'FINISHED' || r.officialTimeMs === undefined) return false;
        if (activeProfile !== 'ALL' && r.raceProfileId !== activeProfile) return false;
        if (selectedCategory !== 'ALL' && r.categoryId !== selectedCategory) return false;
        if (selectedWave !== 'ALL' && r.waveId !== selectedWave) return false;
        if (selectedGender !== 'ALL' && r.gender !== selectedGender) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.officialTimeMs !== b.officialTimeMs) {
          return (a.officialTimeMs || 0) - (b.officialTimeMs || 0);
        }
        if (a.totalMisses !== b.totalMisses) {
          return a.totalMisses - b.totalMisses;
        }
        return (a.bibNumber || 0) - (b.bibNumber || 0);
      });
  }, [results, activeProfile, selectedCategory, selectedWave, selectedGender]);

  const ranksMap = useMemo(() => {
    return new Map(ranked.map((r, index) => [r.participantId, index + 1]));
  }, [ranked]);

  const displayRank = (r: RaceResult): number | undefined => ranksMap.get(r.participantId);

  const displayGap = (r: RaceResult): string => {
    if (!displayRank(r) || ranked.length === 0 || r.officialTimeMs === undefined) return '';
    const leadTime = ranked[0].officialTimeMs!;
    if (r.officialTimeMs === leadTime) return '-';
    const diff = r.officialTimeMs - leadTime;
    return `+${formatDuration(diff, true, false)}`;
  };

  // Top 3 Podium finishers (FASE 7)
  const finishedPodium = useMemo(() => {
    return ranked.slice(0, 3);
  }, [ranked]);

  // Pagination bounds (FASE 6)
  const totalPages = Math.max(1, Math.ceil(filteredResults.length / effectivePageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const paginatedResults = useMemo(() => {
    const startIdx = (currentPage - 1) * effectivePageSize;
    return filteredResults.slice(startIdx, startIdx + effectivePageSize);
  }, [filteredResults, currentPage, effectivePageSize]);

  // Live Clock effect
  useEffect(() => {
    if (!isKioskMode || !kioskConfig.showClock) return;
    const clockTimer = window.setInterval(
      () => setCurrentTime(new Date(raceClock.nowMs())),
      1000
    );
    return () => window.clearInterval(clockTimer);
  }, [isKioskMode, kioskConfig.showClock]);

  // FASE 4 & 6: Rotation and Pagination State Machine
  const activeCategoriesList = useMemo(() => {
    return categories.filter((c) =>
      results.some((r) => (activeProfile === 'ALL' || r.raceProfileId === activeProfile) && r.categoryId === c.id)
    );
  }, [categories, results, activeProfile]);

  const activeProfilesList = useMemo(() => {
    return rawProfiles.map(([id]) => id);
  }, [rawProfiles]);

  const advanceRotation = () => {
    const mode = kioskConfig.rotateMode;
    if (mode === 'NONE') return;

    if (mode === 'CATEGORY') {
      if (activeCategoriesList.length <= 1) return;
      setSelectedCategory((current) => {
        const catIds = activeCategoriesList.map((c) => c.id);
        const idx = catIds.indexOf(current);
        const nextId = catIds[(idx + 1) % catIds.length];
        return nextId;
      });
    } else if (mode === 'PROFILE') {
      if (activeProfilesList.length <= 1) return;
      setSelectedProfile((current) => {
        const idx = activeProfilesList.indexOf(current);
        const nextId = activeProfilesList[(idx + 1) % activeProfilesList.length];
        return nextId;
      });
    } else if (mode === 'PROFILE_AND_CATEGORY' || mode === 'ALL_COMBINATIONS') {
      // Cycle through valid combinations of (profile, category)
      const validPairs: { profId: string; catId: string }[] = [];
      results.forEach((r) => {
        if (
          r.raceProfileId &&
          r.categoryId &&
          !validPairs.some((p) => p.profId === r.raceProfileId && p.catId === r.categoryId)
        ) {
          validPairs.push({ profId: r.raceProfileId, catId: r.categoryId });
        }
      });

      if (validPairs.length === 0) return;
      const currentIdx = validPairs.findIndex(
        (p) => p.profId === selectedProfile && p.catId === selectedCategory
      );
      const nextPair = validPairs[(currentIdx + 1) % validPairs.length];
      setSelectedProfile(nextPair.profId);
      setSelectedCategory(nextPair.catId);
    }
  };

  // Dedicated Pagination timer: changes page every pageSeconds; when reaching last page, triggers rotation!
  useEffect(() => {
    if (!isKioskMode) return;
    const isRotating = kioskConfig.rotateMode !== 'NONE';

    // If only 1 page and rotating, rotate after rotationSeconds
    if (totalPages <= 1) {
      if (!isRotating) return;
      const rotInterval = Math.max(4, kioskConfig.rotationSeconds) * 1000;
      const timer = window.setTimeout(() => {
        advanceRotation();
        setCurrentPage(1);
      }, rotInterval);
      return () => window.clearTimeout(timer);
    }

    // Multiple pages: cycle through all pages using pageSeconds
    const pageInterval = Math.max(3, kioskConfig.pageSeconds) * 1000;
    const timer = window.setTimeout(() => {
      setCurrentPage((prev) => {
        if (prev < totalPages) {
          return prev + 1;
        } else {
          // Reached end of current category: advance rotation and go back to page 1
          if (isRotating) {
            advanceRotation();
          }
          return 1;
        }
      });
    }, pageInterval);

    return () => window.clearTimeout(timer);
  }, [
    isKioskMode,
    currentPage,
    totalPages,
    kioskConfig.rotateMode,
    kioskConfig.rotationSeconds,
    kioskConfig.pageSeconds,
    selectedCategory,
    selectedProfile,
  ]);

  // Fullscreen management
  useEffect(() => {
    onKioskModeChange?.(isKioskMode);
  }, [isKioskMode, onKioskModeChange]);

  useEffect(() => () => onKioskModeChange?.(false), [onKioskModeChange]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsKioskMode(false);
        setShowKioskSettings(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const requestExitKiosk = () => {
    if (kioskConfig.pinLock) {
      setPinPendingAction('exit');
      setPinPromptOpen(true);
      return;
    }
    exitKioskConfirmed();
  };

  const requestOpenSettings = () => {
    if (kioskConfig.pinLock) {
      setPinPendingAction('settings');
      setPinPromptOpen(true);
      return;
    }
    setShowKioskSettings(true);
  };

  const handleVerifyPin = () => {
    if (pinInput === kioskConfig.pinLock) {
      setPinPromptOpen(false);
      setPinInput('');
      setPinError(false);
      if (pinPendingAction === 'exit') {
        exitKioskConfirmed();
      } else if (pinPendingAction === 'settings') {
        setShowKioskSettings(true);
      }
      setPinPendingAction(null);
    } else {
      setPinError(true);
    }
  };

  const exitKioskConfirmed = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
      }
    } catch {}
    setIsKioskMode(false);
    setShowKioskSettings(false);
  };

  const toggleKioskMode = async () => {
    if (isKioskMode) {
      requestExitKiosk();
      return;
    }

    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {}
    setIsKioskMode(true);
  };

  // CSV Export
  const handleExportCsv = () => {
    const headers =
      'Plaats,Startnummer,Naam,Club,Geslacht,Wedstrijdprofiel,Categorie,Wave,Starttijd,Finishtijd,Looptijd (Raw),Missers,Straftijd,Officiële Tijd,Verschil,Status\n';
    const rows = filteredResults.map((r) => {
      return `${displayRank(r) || ''},${r.bibNumber || ''},"${r.name}","${
        r.club || ''
      }",${r.gender || ''},"${r.raceProfileName || ''}","${r.categoryName || ''}","${r.waveName || ''}",${r.startTime || ''},${
        r.finishTime || ''
      },${r.rawElapsedFormatted || ''},${r.totalMisses || 0},${r.penaltyFormatted || ''},${
        r.officialTimeFormatted || ''
      },${displayGap(r) || ''},${r.status}`;
    });

    const csv = headers + rows.join('\n');
    downloadCsvFile(csv, `uitslagen_${Date.now()}.csv`);
  };

  return (
    <div
      ref={containerRef}
      data-text-scale={isKioskMode ? kioskConfig.textScale : undefined}
      className={`space-y-5 text-xs transition-colors ${
        isKioskMode ? 'leaderboard-kiosk p-4 sm:p-6 bg-slate-950 min-h-screen' : ''
      }`}
    >
      {/* Test Mode Notification Banner */}
      {isTestModeActive && (
        <div className="bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 px-4 py-2 rounded-xl flex items-center justify-between shadow-lg font-bold text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
            <span>
              KIOSK TESTMODUS ACTIEF — Demonstratie van rotatie, paginering en podium (Echte database is veilig)
            </span>
          </div>
          <button
            onClick={() => setIsTestModeActive(false)}
            className="px-3 py-1 rounded-lg bg-slate-950 text-amber-300 font-bold hover:bg-slate-900 transition text-[11px]"
          >
            Testmodus Stoppen
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div
        className={
          isKioskMode
            ? 'flex flex-wrap items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl'
            : 'bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4'
        }
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold">
              {mode === 'results' ? 'Officiële Wedstrijduitslagen' : 'Live Wedstrijdbord (Realtime)'}
            </span>
            {event?.officialResultsLocked ? (
              <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1">
                <Lock className="w-3 h-3" /> Vastgelegd
              </span>
            ) : (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-bold uppercase">
                {mode === 'results' ? 'Voorlopige Uitslag' : 'Live Tussentijden'}
              </span>
            )}
            {isKioskMode && kioskConfig.rotateMode !== 'NONE' && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1">
                <RotateCw className="w-3 h-3 animate-spin" style={{ animationDuration: '6s' }} /> Rotatie Actief
              </span>
            )}
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            {event?.name || 'Nieuw evenement'}
          </h2>

          <p className="text-xs text-amber-300 font-bold mt-0.5">
            {profileOptions.find(([id]) => id === activeProfile)?.[1] || 'Alle profielen'} ·{' '}
            {selectedCategory === 'ALL'
              ? 'Alle categorieën'
              : categories.find((c) => c.id === selectedCategory)?.name || 'Categorie'}
          </p>
        </div>

        {/* Top Right Controls & Clock */}
        <div className="flex items-center gap-3">
          {/* Live Clock if enabled */}
          {kioskConfig.showClock && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-850 border border-slate-750 text-amber-300 font-mono font-bold text-sm shadow">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>
                {currentTime.toLocaleTimeString('nl-BE', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>
          )}

          {!isKioskMode && (
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              <Download className="w-4 h-4" /> CSV Export
            </button>
          )}

          {isKioskMode && (
            <button
              type="button"
              onClick={requestOpenSettings}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-750 border border-slate-700 text-xs font-bold transition shadow"
              title="Kiosk Instellingen"
            >
              <Settings className="w-4 h-4" />
              <span>Instellingen</span>
            </button>
          )}

          <button
            onClick={toggleKioskMode}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow ${
              isKioskMode
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-750 border border-slate-700'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>{isKioskMode ? 'Kiosk Verlaten' : 'TV Kiosk Modus'}</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar (Visible when not in kiosk or for quick filtering) */}
      {!isKioskMode && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Zoeken op naam, startnummer of club"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Zoek op naam, startnummer of club..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* FASE 3: Wedstrijdprofiel filter inclusief 'ALL' */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Profiel:</span>
            <select
              aria-label="Wedstrijdprofiel"
              value={activeProfile}
              onChange={(e) => handleSelectProfile(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-semibold text-xs focus:border-amber-500"
            >
              {profileOptions.map(([id, name]) => (
                <option key={`prof-opt-${id}`} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <select
            aria-label="Leeftijdscategorie"
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:border-amber-500"
          >
            <option value="ALL">Alle Categorieën ({categories.length})</option>
            {categories.map((c) => (
              <option key={`lb-cat-${c.id}`} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Wave Filter */}
          <select
            aria-label="Startgroep"
            value={selectedWave}
            onChange={(e) => {
              setSelectedWave(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:border-amber-500"
          >
            <option value="ALL">Alle Waves ({waves.length})</option>
            {waves.map((w) => (
              <option key={`lb-wave-${w.id}`} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          {/* Gender Filter */}
          <select
            aria-label="Geslacht"
            value={selectedGender}
            onChange={(e) => {
              setSelectedGender(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:border-amber-500"
          >
            <option value="ALL">Geslacht (Alle)</option>
            <option value="M">Heren</option>
            <option value="F">Dames</option>
            <option value="X">Open / onbekend</option>
          </select>

          {/* Status Filter */}
          <select
            aria-label="Deelnemerstatus"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as typeof statusFilter);
              setCurrentPage(1);
            }}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:border-amber-500"
          >
            <option value="ALL">Alle statussen</option>
            <option value="REGISTERED">Ingeschreven</option>
            <option value="CHECKED_IN">Aangemeld</option>
            <option value="READY">Klaar voor start</option>
            <option value="STARTED">Onderweg</option>
            <option value="FINISHED">Gefinisht</option>
            <option value="DNS">Niet gestart (DNS)</option>
            <option value="DNF">Niet gefinisht (DNF)</option>
            <option value="DSQ">Gediskwalificeerd (DSQ)</option>
          </select>
        </div>
      )}

      {/* FASE 7: Podium Cards for top 3 finishers */}
      {kioskConfig.showPodium && finishedPodium.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          {/* Silver #2 */}
          {finishedPodium[1] && (
            <div
              onClick={() => !isKioskMode && onSelectParticipant(finishedPodium[1])}
              className="bg-slate-900 border border-slate-750 hover:border-slate-600 rounded-2xl p-4 sm:p-5 shadow-lg cursor-pointer transition flex flex-col justify-between order-2 sm:order-1 relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="w-8 h-8 rounded-xl bg-slate-300 text-slate-950 font-black text-sm flex items-center justify-center shadow">
                  🥈 #2
                </span>
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  ZILVER
                </span>
              </div>
              <div>
                <span className="text-base sm:text-lg font-bold text-white block truncate">
                  {finishedPodium[1].name}
                </span>
                <span className="text-xs text-slate-400">
                  Bib #{finishedPodium[1].bibNumber} • {finishedPodium[1].categoryName}
                </span>
                {finishedPodium[1].club && (
                  <span className="text-[11px] text-slate-400 block italic truncate">
                    {finishedPodium[1].club}
                  </span>
                )}
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {finishedPodium[1].totalMisses} misser(s) ({finishedPodium[1].penaltyFormatted})
                </span>
                <span className="font-mono font-black text-slate-200 text-sm sm:text-base">
                  {finishedPodium[1].officialTimeFormatted}
                </span>
              </div>
            </div>
          )}

          {/* Gold #1 */}
          {finishedPodium[0] && (
            <div
              onClick={() => !isKioskMode && onSelectParticipant(finishedPodium[0])}
              className="bg-gradient-to-b from-amber-950/40 to-slate-900 border-2 border-amber-500/60 rounded-2xl p-5 sm:p-6 shadow-2xl cursor-pointer transition flex flex-col justify-between order-1 sm:order-2 sm:scale-105 z-10 relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 font-black text-base flex items-center justify-center shadow-lg shadow-amber-400/30">
                  🥇 #1
                </span>
                <span className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-1">
                  <Medal className="w-4 h-4" /> GOUD
                </span>
              </div>
              <div>
                <span className="text-lg sm:text-xl font-black text-white block truncate">
                  {finishedPodium[0].name}
                </span>
                <span className="text-xs text-amber-200/90 font-medium">
                  Bib #{finishedPodium[0].bibNumber} • {finishedPodium[0].categoryName}
                </span>
                {finishedPodium[0].club && (
                  <span className="text-[11px] text-slate-400 block italic truncate">
                    {finishedPodium[0].club}
                  </span>
                )}
              </div>
              <div className="mt-3 pt-2.5 border-t border-amber-500/20 flex items-center justify-between text-xs">
                <span className="text-slate-300">
                  {finishedPodium[0].totalMisses} misser(s) ({finishedPodium[0].penaltyFormatted})
                </span>
                <span className="font-mono font-black text-amber-400 text-lg sm:text-xl">
                  {finishedPodium[0].officialTimeFormatted}
                </span>
              </div>
            </div>
          )}

          {/* Bronze #3 */}
          {finishedPodium[2] && (
            <div
              onClick={() => !isKioskMode && onSelectParticipant(finishedPodium[2])}
              className="bg-slate-900 border border-slate-750 hover:border-slate-600 rounded-2xl p-4 sm:p-5 shadow-lg cursor-pointer transition flex flex-col justify-between order-3 relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="w-8 h-8 rounded-xl bg-amber-700 text-white font-black text-sm flex items-center justify-center shadow">
                  🥉 #3
                </span>
                <span className="text-[11px] font-bold text-amber-500 uppercase tracking-wider">
                  BRONS
                </span>
              </div>
              <div>
                <span className="text-base sm:text-lg font-bold text-white block truncate">
                  {finishedPodium[2].name}
                </span>
                <span className="text-xs text-slate-400">
                  Bib #{finishedPodium[2].bibNumber} • {finishedPodium[2].categoryName}
                </span>
                {finishedPodium[2].club && (
                  <span className="text-[11px] text-slate-400 block italic truncate">
                    {finishedPodium[2].club}
                  </span>
                )}
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {finishedPodium[2].totalMisses} misser(s) ({finishedPodium[2].penaltyFormatted})
                </span>
                <span className="font-mono font-black text-slate-200 text-sm sm:text-base">
                  {finishedPodium[2].officialTimeFormatted}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Results Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-850 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <th className="py-3 px-3 w-12 text-center">Pl.</th>
                <th className="py-3 px-3 w-16 text-center">Bib</th>
                <th className="py-3 px-4">Deelnemer</th>
                {activeProfile === 'ALL' && <th className="py-3 px-3">Profiel</th>}
                <th className="py-3 px-3">Categorie</th>
                <th className="py-3 px-3">Startgroep</th>
                <th className="py-3 px-3 text-center">Schieten (H/M)</th>
                <th className="py-3 px-3 text-right">Looptijd (Raw)</th>
                <th className="py-3 px-3 text-right">Straf</th>
                <th className="py-3 px-4 text-right font-bold text-white">Officiële Tijd</th>
                <th className="py-3 px-3 text-right">Verschil</th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {paginatedResults.length === 0 ? (
                <tr>
                  <td colSpan={activeProfile === 'ALL' ? 12 : 11} className="py-12 text-center text-slate-500 italic">
                    Geen deelnemers gevonden die aan de filters voldoen.
                  </td>
                </tr>
              ) : (
                paginatedResults.map((r) => {
                  const isFinished = r.status === 'FINISHED';
                  const rankNum = displayRank(r);

                  return (
                    <tr
                      key={`lb-row-${r.participantId}`}
                      onClick={() => !isKioskMode && onSelectParticipant(r)}
                      className="hover:bg-slate-850/80 cursor-pointer transition"
                    >
                      {/* FASE 7: Medals for top 3 in table */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold">
                        {rankNum ? (
                          rankNum === 1 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-amber-400 text-slate-950 font-black text-xs shadow">
                              🥇
                            </span>
                          ) : rankNum === 2 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-300 text-slate-950 font-black text-xs shadow">
                              🥈
                            </span>
                          ) : rankNum === 3 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-amber-700 text-white font-black text-xs shadow">
                              🥉
                            </span>
                          ) : (
                            <span className="text-slate-300 font-bold">{rankNum}</span>
                          )
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Bib */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-400">
                        #{r.bibNumber || '-'}
                      </td>

                      {/* Name + Club */}
                      <td className="py-2.5 px-4">
                        <span className="font-bold text-white block">{r.name}</span>
                        {r.club && <span className="text-[11px] text-slate-400">{r.club}</span>}
                      </td>

                      {/* Profile (FASE 3: visible when 'ALL' active) */}
                      {activeProfile === 'ALL' && (
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-amber-300 border border-slate-700">
                            {r.raceProfileName || 'Standaard'}
                          </span>
                        </td>
                      )}

                      {/* Category */}
                      <td className="py-2.5 px-3 text-slate-300 font-medium">
                        {r.categoryName || '-'}
                      </td>

                      {/* Wave */}
                      <td className="py-2.5 px-3 text-slate-400">{r.waveName || '-'}</td>

                      {/* Shooting Splits */}
                      <td className="py-2.5 px-3 text-center">
                        {r.shootingRounds.length === 0 ? (
                          <span className="text-slate-600">-</span>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5 font-mono text-[11px]">
                            {r.shootingRounds.map((sr, sIdx) => (
                              <span
                                key={sr.id ? `sr-pill-${sr.id}` : `sr-pill-${r.participantId}-${sr.round}-${sIdx}`}
                                className={`px-1.5 py-0.5 rounded font-bold ${
                                  sr.misses === 0
                                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                                    : 'bg-red-950/60 text-red-300 border border-red-800'
                                }`}
                              >
                                {sr.hits}/{sr.shots ?? 5}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Raw Elapsed */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                        {r.rawElapsedFormatted || '-'}
                      </td>

                      {/* Penalty */}
                      <td className="py-2.5 px-3 text-right font-mono text-amber-400 font-semibold">
                        {r.totalMisses > 0 ? r.penaltyFormatted : '-'}
                      </td>

                      {/* Official Time */}
                      <td className="py-2.5 px-4 text-right font-mono font-black text-sm text-emerald-400">
                        {isFinished ? r.officialTimeFormatted : '-'}
                      </td>

                      {/* Gap */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                        {displayGap(r) || '-'}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            r.status === 'FINISHED'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : r.status === 'STARTED'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : r.status === 'DNF' || r.status === 'DNS' || r.status === 'DSQ'
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {r.resultIssues?.length ? 'VOORLOPIG' : r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* FASE 6: Pagination Footer with Page Indicator & Controls */}
        <div className="p-3 sm:p-4 bg-slate-850 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="text-slate-400 flex items-center gap-2">
            <span>
              Totaal <strong className="text-white">{filteredResults.length}</strong> deelnemer(s)
            </span>
            {totalPages > 1 && (
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 font-bold border border-slate-700">
                Pagina {currentPage} / {totalPages}
              </span>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 disabled:opacity-30 border border-slate-700 transition"
                title="Vorige pagina"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-slate-300 font-mono font-bold px-2">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 disabled:opacity-30 border border-slate-700 transition"
                title="Volgende pagina"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Kiosk Settings Modal */}
      <KioskSettingsModal
        isOpen={showKioskSettings}
        onClose={() => setShowKioskSettings(false)}
        config={kioskConfig}
        onUpdateConfig={handleUpdateConfig}
        categories={categories}
        profiles={profileOptions}
        isTestModeActive={isTestModeActive}
        onToggleTestMode={() => setIsTestModeActive((prev) => !prev)}
        onExitKiosk={requestExitKiosk}
      />

      {/* PIN Verification Modal */}
      {pinPromptOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Kiosk Beveiligd</h3>
              <p className="text-xs text-slate-400 mt-1">
                Voer de beheerderspincode in om door te gaan
              </p>
            </div>
            <div>
              <input
                type="password"
                autoFocus
                maxLength={8}
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleVerifyPin();
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-center font-mono text-lg text-white tracking-widest focus:outline-none focus:border-amber-500"
                placeholder="••••"
              />
              {pinError && (
                <p className="text-xs text-red-400 font-semibold mt-1">
                  Onjuiste pincode. Probeer opnieuw.
                </p>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setPinPromptOpen(false);
                  setPinInput('');
                  setPinError(false);
                  setPinPendingAction(null);
                }}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs transition"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={handleVerifyPin}
                className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow"
              >
                Ontgrendelen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
