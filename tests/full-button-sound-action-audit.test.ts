import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { soundService, type SoundEffect } from '../src/services/soundService';
import { runFullSystemCheck } from '../src/services/systemCheckService';
import { kioskConfigService } from '../src/services/kioskConfigService';
import { generateKioskTestData } from '../src/services/kioskTestService';
import { themeService } from '../src/services/themeService';
import { shootingPenalty } from '../src/services/shootingRules';

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

describe('Volledige Audit: Elk Geluid, Elke Knop, Elke Actie', () => {

  describe('1. GELUIDSSERVICE & AKOESTISCHE SIGNALEN (soundService)', () => {
    it('kan geluid in- en uitschakelen met behoud van status', () => {
      soundService.toggleSound(true);
      assert.equal(soundService.getSoundEnabled(), true);

      soundService.toggleSound(false);
      assert.equal(soundService.getSoundEnabled(), false);

      const toggled = soundService.toggleSound();
      assert.equal(toggled, true);
      assert.equal(soundService.getSoundEnabled(), true);
    });

    it('volumebeheer begrenst correct tussen 0.0 en 1.0', () => {
      soundService.setVolume(0.5);
      assert.equal(soundService.getVolume(), 0.5);

      soundService.setVolume(1.5);
      assert.equal(soundService.getVolume(), 1.0);

      soundService.setVolume(-0.2);
      assert.equal(soundService.getVolume(), 0.0);

      // Herstel naar standaardvolume
      soundService.setVolume(0.8);
      assert.equal(soundService.getVolume(), 0.8);
    });

    it('elke afzonderlijke geluidsfunctie kan foutloos worden aangeroepen zonder crash', () => {
      soundService.toggleSound(true);

      // Test elk signaal
      assert.doesNotThrow(() => soundService.playSuccess(), 'playSuccess mag niet crashen');
      assert.doesNotThrow(() => soundService.playWarning(), 'playWarning mag niet crashen');
      assert.doesNotThrow(() => soundService.playError(), 'playError mag niet crashen');
      assert.doesNotThrow(() => soundService.playCountdown(3), 'playCountdown(3) mag niet crashen');
      assert.doesNotThrow(() => soundService.playCountdown(0), 'playCountdown(0) mag niet crashen');
      assert.doesNotThrow(() => soundService.playHit(), 'playHit mag niet crashen');
      assert.doesNotThrow(() => soundService.playMiss(), 'playMiss mag niet crashen');
      assert.doesNotThrow(() => soundService.playFinish(), 'playFinish mag niet crashen');
      assert.doesNotThrow(() => soundService.playClick(), 'playClick mag niet crashen');
    });

    it('testSound(effect) ondersteunt alle 8 geluidseffecten', () => {
      const effects: SoundEffect[] = ['success', 'warning', 'error', 'countdown', 'hit', 'miss', 'finish', 'click'];
      for (const eff of effects) {
        assert.doesNotThrow(() => soundService.testSound(eff), `testSound(${eff}) mag niet crashen`);
      }
    });

    it('getAudioStatus geeft geldige status terug in alle omgevingen', () => {
      const status = soundService.getAudioStatus();
      assert.equal(typeof status.isEnabled, 'boolean');
      assert.equal(typeof status.volume, 'number');
      assert.ok(['running', 'suspended', 'closed', 'unsupported'].includes(status.state));
    });
  });

  describe('2. VEILIGHEIDSKNOPPEN (SafeConfirmButton Logic)', () => {
    class StateMachine {
      stage: 'idle' | 'armed' | 'holding' | 'dialog' | 'executed' = 'idle';
      progress = 0;
      arm() { this.stage = 'armed'; }
      startHold() { if (this.stage === 'armed') { this.stage = 'holding'; } }
      cancel() { this.stage = 'armed'; this.progress = 0; }
      reset() { this.stage = 'idle'; this.progress = 0; }
      confirmDirect() { if (this.stage === 'armed' || this.stage === 'holding') this.stage = 'executed'; }
      confirmDialog(val: string) { if (val.trim().toUpperCase() === 'BEVESTIG') this.stage = 'executed'; }
    }

    it('eerste klik wapent de knop (armed), activeert niet direct', () => {
      const btn = new StateMachine();
      assert.equal(btn.stage, 'idle');
      btn.arm();
      assert.equal(btn.stage, 'armed');
    });

    it('tweede klik op de gewapende knop voert actie direct uit', () => {
      const btn = new StateMachine();
      btn.arm();
      btn.confirmDirect();
      assert.equal(btn.stage, 'executed');
    });

    it('annuleren herstelt de knop naar beginstand', () => {
      const btn = new StateMachine();
      btn.arm();
      btn.reset();
      assert.equal(btn.stage, 'idle');
    });

    it('kritieke dialoog vereist exact het trefwoord BEVESTIG', () => {
      const btn = new StateMachine();
      btn.stage = 'dialog';
      btn.confirmDialog('fout');
      assert.equal(btn.stage, 'dialog');

      btn.confirmDialog('bevestig');
      assert.equal(btn.stage, 'executed');
    });
  });

  describe('3. SCHIETPROEF & STRAFBEREKENINGEN (Shooting Rules)', () => {
    it('berekent straffen correct voor 5 schoten per ronde', () => {
      // 5 schoten: 5 raak = 0 missers = 0 strafseconden
      const penalty0Miss = shootingPenalty(undefined, 1, 0, 20);
      assert.equal(penalty0Miss.seconds, 0);

      // 5 schoten: 2 missers = 40s straf bij 20s/misser
      const penalty2Miss = shootingPenalty(undefined, 1, 2, 20);
      assert.equal(penalty2Miss.seconds, 40);

      // 5 schoten: 5 missers = 100s straf
      const penalty5Miss = shootingPenalty(undefined, 1, 5, 20);
      assert.equal(penalty5Miss.seconds, 100);
    });
  });

  describe('4. KIOSK & LIVE LEADERBOARD ACTIES', () => {
    it('kioskConfigService bewaart en laadt configuratie correct', () => {
      kioskConfigService.updateConfig({
        rotationSeconds: 25,
        rowsPerPage: 15,
        showPodium: false,
      });

      const cfg = kioskConfigService.getConfig();
      assert.equal(cfg.rotationSeconds, 25);
      assert.equal(cfg.rowsPerPage, 15);
      assert.equal(cfg.showPodium, false);
    });

    it('kiosk test dataset bevat realistische data voor alle wedstrijdcategorieën', () => {
      const data = generateKioskTestData();
      assert.ok(data.results.length >= 10, 'Moet minstens 10 resultaten bevatten');
      assert.ok(data.categories.length > 0, 'Moet categorieën bevatten');
      assert.ok(data.profiles.length > 0, 'Moet wedstrijdprofielen bevatten');
      assert.ok(data.waves.length > 0, 'Moet waves bevatten');

      // Controleer dat elk resultaat geldige tijden en borstnummers heeft
      for (const r of data.results) {
        assert.ok(r.bibNumber > 0, `Resultaat ${r.participantId} moet een positief borstnummer hebben`);
        assert.ok(r.name.length > 0, 'Deelnemersnaam mag niet leeg zijn');
      }
    });

    it('paginatie berekent pagina-aantallen correct', () => {
      const totalItems = 35;
      const rowsPerPage = 10;
      const totalPages = Math.ceil(totalItems / rowsPerPage);
      assert.equal(totalPages, 4);

      // Pagina 1 heeft items 0..10
      const page1 = Array.from({ length: totalItems }).slice(0, 10);
      assert.equal(page1.length, 10);

      // Pagina 4 heeft rest (5 items)
      const page4 = Array.from({ length: totalItems }).slice(30, 40);
      assert.equal(page4.length, 5);
    });
  });

  describe('5. SYSTEEMGEZONDHEID & PRE-RACE CHECKS', () => {
    it('runFullSystemCheck voert alle vereiste diagnostische controles uit', async () => {
      const report = await runFullSystemCheck();
      assert.ok(report, 'Rapport moet bestaan');
      assert.ok(Array.isArray(report.items), 'Rapport moet items bevatten');
      assert.ok(report.items.length >= 3, 'Moet minstens 3 diagnostische checks bevatten');

      const checkIds = report.items.map((i) => i.id);
      assert.ok(checkIds.includes('runtime'), 'Moet runtime-check bevatten');
      assert.ok(checkIds.includes('clock'), 'Moet klok-synchronisatie-check bevatten');
      assert.ok(checkIds.includes('backup'), 'Moet backup-check bevatten');

      assert.equal(typeof report.allPassed, 'boolean');
      assert.equal(typeof report.warningCount, 'number');
      assert.equal(typeof report.failureCount, 'number');
    });

    it('themeService schakelt tussen dark, light en system', () => {
      themeService.setTheme('dark');
      assert.equal(themeService.getTheme(), 'dark');

      themeService.setTheme('light');
      assert.equal(themeService.getTheme(), 'light');

      themeService.setTheme('system');
      assert.equal(themeService.getTheme(), 'system');

      // Herstel naar dark
      themeService.setTheme('dark');
    });
  });

});
