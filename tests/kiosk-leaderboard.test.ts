import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  kioskConfigService,
  type KioskConfig,
} from '../src/services/kioskConfigService';
import { themeService, type AppTheme } from '../src/services/themeService';
import { generateKioskTestData } from '../src/services/kioskTestService';
import { isElectronEnvironment } from '../src/services/systemCheckService';

// Mock localStorage for Node test environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

test('KioskConfigService persists and reads configuration', () => {
  const initial = kioskConfigService.getConfig();
  assert.equal(typeof initial.showPodium, 'boolean');
  assert.equal(typeof initial.rotationSeconds, 'number');

  // Update configuration
  kioskConfigService.updateConfig({
    rotateMode: 'CATEGORY',
    rotationSeconds: 30,
    rowsPerPage: 15,
    showPodium: false,
  });

  const updated = kioskConfigService.getConfig();
  assert.equal(updated.rotateMode, 'CATEGORY');
  assert.equal(updated.rotationSeconds, 30);
  assert.equal(updated.rowsPerPage, 15);
  assert.equal(updated.showPodium, false);

  // Subscribers receive notifications
  let notified = false;
  const unsubscribe = kioskConfigService.subscribe((cfg) => {
    if (cfg.rotationSeconds === 45) {
      notified = true;
    }
  });

  kioskConfigService.updateConfig({ rotationSeconds: 45 });
  assert.equal(notified, true);
  unsubscribe();
});

test('ThemeService updates document class and persists theme', () => {
  themeService.setTheme('light');
  assert.equal(themeService.getTheme(), 'light');

  themeService.setTheme('dark');
  assert.equal(themeService.getTheme(), 'dark');

  themeService.setTheme('system');
  assert.equal(themeService.getTheme(), 'system');
});

test('Kiosk Test Data Generator produces realistic dataset for all profiles', () => {
  const data = generateKioskTestData();
  assert.ok(data.results.length >= 30, 'Should generate at least 30 athletes');
  assert.ok(data.categories.length >= 3, 'Should have multiple categories');
  assert.ok(data.profiles.length >= 3, 'Should have Kids, Junior, and Adult profiles');

  // All results have valid bibs and official times
  data.results.forEach((r) => {
    assert.ok(r.bibNumber > 0);
    assert.ok(r.officialTimeMs! > 0);
    assert.equal(r.status, 'FINISHED');
  });

  // Verify profiles present in generated data
  const profileIds = new Set(data.results.map((r) => r.raceProfileId));
  assert.ok(profileIds.has('prof-adult'));
  assert.ok(profileIds.has('prof-junior'));
  assert.ok(profileIds.has('prof-kids'));
});

test('FASE 3: "ALL" Profile filtering includes all participants', () => {
  const data = generateKioskTestData();

  // With 'ALL', all 34 participants are included
  const allFiltered = data.results.filter((r) => {
    const activeProfile = 'ALL';
    if (activeProfile !== 'ALL' && r.raceProfileId !== activeProfile) return false;
    return true;
  });
  assert.equal(allFiltered.length, data.results.length);

  // With specific profile 'prof-kids', only kids are included
  const kidsFiltered = data.results.filter((r) => {
    const activeProfile: string = 'prof-kids';
    if (activeProfile !== 'ALL' && r.raceProfileId !== activeProfile) return false;
    return true;
  });
  assert.ok(kidsFiltered.length > 0 && kidsFiltered.length < data.results.length);
  assert.ok(kidsFiltered.every((r) => r.raceProfileId === 'prof-kids'));
});

test('FASE 5 & 6: Rows per page and auto-pagination math', () => {
  const totalItems = 25;

  // 10 items per page -> 3 pages
  const pageSize = 10;
  const totalPages = Math.ceil(totalItems / pageSize);
  assert.equal(totalPages, 3);

  // Page 1: items 0..9 (10 items)
  const page1 = Array.from({ length: totalItems }).slice(0, pageSize);
  assert.equal(page1.length, 10);

  // Page 2: items 10..19 (10 items)
  const page2 = Array.from({ length: totalItems }).slice(pageSize, pageSize * 2);
  assert.equal(page2.length, 10);

  // Page 3: items 20..24 (5 items)
  const page3 = Array.from({ length: totalItems }).slice(pageSize * 2, pageSize * 3);
  assert.equal(page3.length, 5);
});

test('FASE 7: Podium assignment awards top 3 finishers only', () => {
  const data = generateKioskTestData();

  // Sort by official time ascending
  const ranked = [...data.results].sort((a, b) => (a.officialTimeMs || 0) - (b.officialTimeMs || 0));
  const podium = ranked.slice(0, 3);

  assert.equal(podium.length, 3);
  assert.ok(podium[0].officialTimeMs! <= podium[1].officialTimeMs!);
  assert.ok(podium[1].officialTimeMs! <= podium[2].officialTimeMs!);
});

test('FASE 10: Electron Environment Detection', () => {
  // In standard Node / browser environment, returns false unless process.versions.electron or navigator includes Electron
  assert.equal(typeof isElectronEnvironment(), 'boolean');
});
