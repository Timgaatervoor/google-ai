export type RotationMode =
  | 'NONE'
  | 'PROFILE'
  | 'CATEGORY'
  | 'PROFILE_AND_CATEGORY'
  | 'ALL_COMBINATIONS';

export type RowsPerPageSetting = 'AUTO' | 5 | 10 | 15 | 20;
export type KioskStatusFilter = 'FINISHED' | 'STARTED_AND_FINISHED' | 'ALL';
export type TextScaleSetting = 'normal' | 'large' | 'extra-large';

export interface KioskConfig {
  rotateMode: RotationMode;
  rotationSeconds: number; // Interval for changing profile/category
  pageSeconds: number; // Interval for changing pages within a category/profile
  rowsPerPage: RowsPerPageSetting;
  showPodium: boolean;
  showClock: boolean;
  statusFilter: KioskStatusFilter;
  textScale: TextScaleSetting;
  selectedProfileId: string; // 'ALL' or specific profileId
  selectedCategoryId: string; // 'ALL' or specific categoryId
  categoryIds: string[]; // Specific subset of category IDs included in rotation (empty = all)
  profileIds: string[]; // Specific subset of profile IDs included in rotation (empty = all)
  pinLock: string; // PIN for locking kiosk
  isLocked: boolean;
}

const STORAGE_KEY = 'biathlon_kiosk_config';

export const defaultKioskConfig: KioskConfig = {
  rotateMode: 'CATEGORY',
  rotationSeconds: 15,
  pageSeconds: 8,
  rowsPerPage: 'AUTO',
  showPodium: true,
  showClock: true,
  statusFilter: 'ALL',
  textScale: 'normal',
  selectedProfileId: 'ALL',
  selectedCategoryId: 'ALL',
  categoryIds: [],
  profileIds: [],
  pinLock: '',
  isLocked: false,
};

class KioskConfigService {
  private config: KioskConfig = defaultKioskConfig;
  private listeners: Set<(config: KioskConfig) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          this.config = { ...defaultKioskConfig, ...parsed };
        }
      } catch (e) {
        console.warn('Failed to load kiosk config from localStorage', e);
      }
    }
  }

  public getConfig(): KioskConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<KioskConfig>): KioskConfig {
    this.config = { ...this.config, ...partial };
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      } catch (e) {
        console.warn('Failed to save kiosk config to localStorage', e);
      }
    }
    this.notify();
    return { ...this.config };
  }

  public subscribe(callback: (config: KioskConfig) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    const copy = { ...this.config };
    this.listeners.forEach((listener) => listener(copy));
  }
}

export const kioskConfigService = new KioskConfigService();
