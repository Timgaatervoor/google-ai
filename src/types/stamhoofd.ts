export interface StamhoofdShop {
  id: string;
  organizationId: string;
  name: string;
  domain: string;
}
export interface StamhoofdConfig {
  id: string; // Local event ID
  workerUrl: string;
  domain: string;
  shop?: StamhoofdShop;
  fields: string[];
  mapping: Record<string, string>;
  /** Legacy backup field; new imports use profile articles and age categories. */
  productCategories: Record<string, string>;
  lastSyncAt?: string;
}
export interface StamhoofdSnapshot {
  shop: StamhoofdShop;
  webshop: Record<string, any>;
  orders: Record<string, any>[];
  tickets: Record<string, any>[];
  fetchedAt: string;
}
export interface StamhoofdRegistration {
  [key: string]: string | Record<string, string> | undefined;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  customFields?: Record<string, string>;
}
export interface StamhoofdSource {
  stamhoofdEventId?: string;
  stamhoofdOrganizationId?: string;
  stamhoofdWebshopId?: string;
  stamhoofdOrderId?: string;
  stamhoofdItemId?: string;
  stamhoofdTicketId?: string;
  stamhoofdTicketSecret?: string;
  stamhoofdTicketUrl?: string;
  stamhoofdUpdatedAt?: string;
  stamhoofdRegisteredAt?: string;
  stamhoofdLastSyncAt?: string;
  stamhoofdInactive?: boolean;
  stamhoofdRegistration?: StamhoofdRegistration;
  /** Last imported values allow manual local corrections to survive subsequent syncs. */
  stamhoofdBaseline?: Record<string, string>;
}
