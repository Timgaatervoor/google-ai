import { db } from '../db/dexieDb';
import { raceClock } from './raceClock';

export interface SystemCheckItem {
  id: string;
  label: string;
  category: 'runtime' | 'database' | 'clock' | 'backup' | 'sync';
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  timestamp: string;
}

export interface SystemCheckReport {
  isElectron: boolean;
  isPwa: boolean;
  online: boolean;
  items: SystemCheckItem[];
  allPassed: boolean;
  warningCount: number;
  failureCount: number;
}

export function isElectronEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).process?.versions?.electron ||
    navigator.userAgent.includes('Electron')
  );
}

export async function runFullSystemCheck(): Promise<SystemCheckReport> {
  const isElectron = isElectronEnvironment();
  const isPwa = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const nowStr = new Date().toLocaleTimeString('nl-BE');

  const items: SystemCheckItem[] = [];

  // 1. Runtime Environment Check (Electron vs Browser/PWA)
  if (isElectron) {
    items.push({
      id: 'runtime',
      label: 'Desktop applicatie (Electron)',
      category: 'runtime',
      status: 'pass',
      detail: 'Draait als native desktop applicatie. Geen browser service worker vereist.',
      timestamp: nowStr,
    });
  } else {
    const swActive = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
    items.push({
      id: 'runtime',
      label: 'PWA / Browser Cache',
      category: 'runtime',
      status: swActive ? 'pass' : 'warn',
      detail: swActive
        ? 'Offline service worker actief voor standalone werking.'
        : 'Service worker niet geregistreerd (standaard bij dev server of niet-geïnstalleerde webapp).',
      timestamp: nowStr,
    });
  }

  // 2. Local Database Check (Dexie IndexedDB)
  try {
    const [eventsCount, participantsCount, timingCount, shootingCount] = await Promise.all([
      db.events.count(),
      db.participants.count(),
      db.timingRecords.count(),
      db.shootingResults.count(),
    ]);

    items.push({
      id: 'database',
      label: 'Lokale IndexedDB Opslag',
      category: 'database',
      status: 'pass',
      detail: `Dexie database operationeel: ${eventsCount} evenement(en), ${participantsCount} deelnemer(s), ${timingCount} tijdregistratie(s), ${shootingCount} schietbeurten.`,
      timestamp: nowStr,
    });
  } catch (err: any) {
    items.push({
      id: 'database',
      label: 'Lokale IndexedDB Opslag',
      category: 'database',
      status: 'fail',
      detail: `Fout bij openen van lokale database: ${err?.message || 'Onbekende fout'}`,
      timestamp: nowStr,
    });
  }

  // 3. Clock & Synchronization
  const clock = raceClock.status();
  if (clock.state === 'SYNCED') {
    items.push({
      id: 'clock',
      label: 'Klok & Tijdsynchronisatie',
      category: 'clock',
      status: 'pass',
      detail: `NTP/Server klok gesynchroniseerd (afwijking ${clock.offsetMs > 0 ? '+' : ''}${Math.round(clock.offsetMs)}ms, onzekerheid ±${Math.ceil(clock.uncertaintyMs || 0)}ms).`,
      timestamp: nowStr,
    });
  } else {
    items.push({
      id: 'clock',
      label: 'Klok & Tijdsynchronisatie',
      category: 'clock',
      status: 'warn',
      detail: 'Systeemklok gebruikt lokale computertijd; nog geen centrale NTP-synchronisatiemeting uitgevoerd.',
      timestamp: nowStr,
    });
  }

  // 4. External Backup status
  const lastBackupStr = typeof window !== 'undefined' ? localStorage.getItem('biathlon_last_backup_time') : null;
  if (lastBackupStr) {
    const lastDate = new Date(lastBackupStr);
    const hoursAgo = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60);
    const status = hoursAgo < 24 ? 'pass' : 'warn';
    items.push({
      id: 'backup',
      label: 'Externe Veiligheidsback-up',
      category: 'backup',
      status,
      detail: `Laatste handmatige back-up opgeslagen op ${lastDate.toLocaleString('nl-BE')}.`,
      timestamp: nowStr,
    });
  } else {
    items.push({
      id: 'backup',
      label: 'Externe Veiligheidsback-up',
      category: 'backup',
      status: 'warn',
      detail: 'Nog geen externe JSON/CSV back-up geëxporteerd. Exporteer regelmatig een kopie naar USB/externe schijf.',
      timestamp: nowStr,
    });
  }

  // 5. Offline Sync Journal
  try {
    const pendingOps = await db.operations.filter((op) => op.syncStatus === 'LOCAL_ONLY').count();
    items.push({
      id: 'sync',
      label: 'Synchronisatiewachtrij & Journal',
      category: 'sync',
      status: pendingOps === 0 ? 'pass' : 'warn',
      detail: pendingOps === 0
        ? 'Alle lokale wijzigingen zijn synchroon (geen openstaande wachtrij).'
        : `${pendingOps} lokale wijziging(en) in wachtrij voor cloud synchronisatie.`,
      timestamp: nowStr,
    });
  } catch {
    // Ignore if operations table unavailable
  }

  const failureCount = items.filter((i) => i.status === 'fail').length;
  const warningCount = items.filter((i) => i.status === 'warn').length;

  return {
    isElectron,
    isPwa,
    online,
    items,
    allPassed: failureCount === 0 && warningCount === 0,
    warningCount,
    failureCount,
  };
}
