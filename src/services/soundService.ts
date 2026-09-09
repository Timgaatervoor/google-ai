// Centralized Web Audio Sound Service for Race Stations & Events
// Handles browser autoplay restrictions, interaction-based unlocking, volume control, and station sound effects.

export type SoundEffect = 'success' | 'warning' | 'error' | 'countdown' | 'hit' | 'miss' | 'finish' | 'click';

class SoundService {
  private audioCtx: AudioContext | null = null;
  private isEnabled = true;
  private volume = 0.8;
  private hasUnlocked = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const savedEnabled = localStorage.getItem('biathlon_sound_enabled');
      if (savedEnabled !== null) {
        this.isEnabled = savedEnabled === 'true';
      }
      const savedVolume = localStorage.getItem('biathlon_sound_volume');
      if (savedVolume !== null) {
        const parsed = parseFloat(savedVolume);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          this.volume = parsed;
        }
      }

      // Auto-unlock audio context upon first user gesture anywhere in the page
      this.attachUnlockListeners();
    }
  }

  private attachUnlockListeners(): void {
    if (typeof window === 'undefined') return;

    const unlockHandler = () => {
      this.unlock();
      if (this.hasUnlocked) {
        ['pointerdown', 'touchstart', 'click', 'keydown'].forEach((evt) => {
          window.removeEventListener(evt, unlockHandler);
        });
      }
    };

    ['pointerdown', 'touchstart', 'click', 'keydown'].forEach((evt) => {
      window.addEventListener(evt, unlockHandler, { passive: true });
    });
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    try {
      const ctx = this.getOrCreateContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          this.hasUnlocked = true;
        }).catch(() => {});
      } else if (ctx && ctx.state === 'running') {
        this.hasUnlocked = true;
      }
    } catch {
      // Ignore if autoplay policy blocks before interaction
    }
  }

  public toggleSound(enabled?: boolean): boolean {
    this.isEnabled = enabled !== undefined ? enabled : !this.isEnabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('biathlon_sound_enabled', String(this.isEnabled));
    }
    if (this.isEnabled) {
      this.unlock();
    }
    return this.isEnabled;
  }

  public getSoundEnabled(): boolean {
    return this.isEnabled;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (typeof window !== 'undefined') {
      localStorage.setItem('biathlon_sound_volume', String(this.volume));
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public getAudioStatus(): {
    isEnabled: boolean;
    volume: number;
    state: 'running' | 'suspended' | 'closed' | 'unsupported';
  } {
    if (typeof window === 'undefined') {
      return { isEnabled: this.isEnabled, volume: this.volume, state: 'unsupported' };
    }
    if (!this.audioCtx) {
      return { isEnabled: this.isEnabled, volume: this.volume, state: 'suspended' };
    }
    return {
      isEnabled: this.isEnabled,
      volume: this.volume,
      state: this.audioCtx.state,
    };
  }

  private getOrCreateContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      } catch (err) {
        console.warn('AudioContext kon niet worden geïnitialiseerd:', err);
        return null;
      }
    }
    return this.audioCtx;
  }

  private async ensureRunningContext(): Promise<AudioContext | null> {
    if (!this.isEnabled) return null;
    const ctx = this.getOrCreateContext();
    if (!ctx) return null;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
        this.hasUnlocked = true;
      } catch {
        // May fail if user hasn't interacted yet
      }
    }
    return ctx;
  }

  private safePlay(playFn: (ctx: AudioContext, masterGain: GainNode) => void): void {
    if (!this.isEnabled || this.volume <= 0) return;

    void (async () => {
      try {
        const ctx = await this.ensureRunningContext();
        if (!ctx) return;

        // Master gain for user volume setting
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(this.volume, ctx.currentTime);
        masterGain.connect(ctx.destination);

        playFn(ctx, masterGain);
      } catch (err) {
        // Never let audio failures crash UI handlers
        console.warn('Geluid afspelen mislukt:', err);
      }
    })();
  }

  /**
   * Two-tone pleasant chime for successful operations (Finish, Save, Pass).
   */
  public playSuccess(): void {
    this.safePlay((ctx, masterGain) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.12); // A6

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.26);
    });
  }

  /**
   * Attention warning beep (Countdown, Overwrite, Warning).
   */
  public playWarning(): void {
    this.safePlay((ctx, masterGain) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(440, now + 0.1); // A4

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.3);
    });
  }

  /**
   * Low alert buzz for penalties, conflicts, or errors.
   */
  public playError(): void {
    this.safePlay((ctx, masterGain) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now); // A3
      osc.frequency.linearRampToValueAtTime(120, now + 0.25);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.34);
    });
  }

  /**
   * Start countdown pip (secondsLeft > 0) or GO fanfare (secondsLeft === 0).
   */
  public playCountdown(secondsLeft: number): void {
    if (secondsLeft > 0) {
      // Short clear pip
      this.safePlay((ctx, masterGain) => {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now); // E5
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + 0.13);
      });
    } else {
      // Bright GO chime
      this.safePlay((ctx, masterGain) => {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1318.51, now); // E6
        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + 0.42);
      });
    }
  }

  /**
   * Crisp metallic target ping for a shooting HIT.
   */
  public playHit(): void {
    this.safePlay((ctx, masterGain) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.05);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.2);
    });
  }

  /**
   * Low dull target thud for a shooting MISS.
   */
  public playMiss(): void {
    this.safePlay((ctx, masterGain) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(90, now + 0.18);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.22);
    });
  }

  /**
   * Triumphant 3-tone victory chord for Finish Line crossing.
   */
  public playFinish(): void {
    this.safePlay((ctx, masterGain) => {
      const now = ctx.currentTime;
      const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const noteStart = now + idx * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteStart);

        gain.gain.setValueAtTime(0.25, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.35);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(noteStart);
        osc.stop(noteStart + 0.37);
      });
    });
  }

  /**
   * Subtle tactile click for numpad and quick actions.
   */
  public playClick(): void {
    this.safePlay((ctx, masterGain) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, now);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.035);
    });
  }

  /**
   * Test a specific sound effect or all sounds.
   */
  public testSound(effect: SoundEffect = 'success'): void {
    // Ensure enabled when user explicitly tests
    if (!this.isEnabled) {
      this.toggleSound(true);
    }
    this.unlock();

    switch (effect) {
      case 'success':
        this.playSuccess();
        break;
      case 'warning':
        this.playWarning();
        break;
      case 'error':
        this.playError();
        break;
      case 'countdown':
        this.playCountdown(0);
        break;
      case 'hit':
        this.playHit();
        break;
      case 'miss':
        this.playMiss();
        break;
      case 'finish':
        this.playFinish();
        break;
      case 'click':
        this.playClick();
        break;
    }
  }
}

export const soundService = new SoundService();

