import type { Participant } from '../types';
import type { StamhoofdConfig, StamhoofdRegistration, StamhoofdSnapshot } from '../types/stamhoofd';
import { db } from '../db/dexieDb';
import { autoDetectMapping } from './stamhoofdParser';
import { operationService, generateUUID } from './operationService';
import { classifyParticipant } from './participantClassification';

export const importFields: Record<string, string> = {
  firstName: 'Voornaam', lastName: 'Achternaam', birthDate: 'Geboortedatum', gender: 'Geslacht', product: 'Artikel', distance: 'Afstand', orderNumber: 'Bestelnummer', paymentStatus: 'Betaalstatus', email: 'E-mail besteller', phone: 'Telefoon besteller', ticketId: 'Stamhoofd ticket-ID', ticketSecret: 'Ticket secret', ticketUrl: 'Ticket URL', scannedAt: 'Ticket scannedAt', scannedBy: 'Ticket scannedBy',
};
export const defaultFields = ['firstName', 'lastName', 'birthDate', 'gender', 'product', 'distance', 'orderNumber', 'paymentStatus', 'ticketId', 'ticketSecret', 'ticketUrl', 'scannedAt', 'scannedBy'];
export function textValue(value: any): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object') return textValue(value.nl ?? value.name ?? value.firstName ?? '');
  return '';
}
function items(order: any): any[] {
  if (!Array.isArray(order.data?.cart?.items)) throw new Error('Order zonder geldige cart items; synchronisatie afgebroken.');
  return order.data.cart.items;
}
export function discoverFields(snapshot: StamhoofdSnapshot) {
  const fields = new Map<string, string>();
  const visit = (value: any, isField = false) => {
    if (!value || typeof value !== 'object') return;
    if (isField && value.id && value.name) fields.set(String(value.id), textValue(value.name));
    for (const [key, child] of Object.entries(value)) if (/field|product|categor/i.test(key) || Array.isArray(value)) {
      if (Array.isArray(child)) child.forEach(v => visit(v, /field/i.test(key))); else visit(child, /field/i.test(key));
    }
  };
  visit(snapshot.webshop);
  for (const order of snapshot.orders) for (const item of items(order)) for (const a of item.fieldAnswers ?? []) {
    if (a.field?.id || a.field?.name) fields.set(a.field.id || textValue(a.field.name), textValue(a.field.name));
  }
  return [...fields].map(([id, name]) => ({ id, name }));
}
export function ticketUrl(domain: string, secret: string): string {
  const url = new URL(`https://${domain}`);
  if (url.hostname !== domain || url.port || url.username || url.password) throw new Error('Ongeldig webshopdomein.');
  return `${url.origin}/tickets/${encodeURIComponent(secret)}`;
}
export function paymentStatus(order: any): string {
  const statuses = (order.balanceItems ?? []).flatMap((b: any) => (b.payments ?? []).map((p: any) => p.payment?.status));
  if (!statuses.length) return 'Onbekend';
  if (statuses.every((s: string) => s === 'Succeeded')) return 'Betaald';
  if (statuses.some((s: string) => ['Failed', 'Cancelled', 'Canceled'].includes(s))) return 'Mislukt';
  return 'In behandeling';
}
export interface SyncRow {
  registeredAt?: string;
  itemId: string; orderId: string; productId: string; updatedAt: string;
  registration: StamhoofdRegistration; inactive: boolean; errors: string[];
  payment: string; ticket?: any; existing?: Participant;
  change: 'nieuw' | 'gewijzigd' | 'ongewijzigd' | 'geannuleerd';
}
export function normalize(snapshot: StamhoofdSnapshot, config: StamhoofdConfig): { rows: SyncRow[]; warnings: string[] } {
  const rows: SyncRow[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const allItemIds = new Set(snapshot.orders.flatMap(o => items(o).map(i => i.id)));
  if (snapshot.tickets.some(t => !t.id || !t.itemId || !t.orderId || t.deletedAt === undefined)) throw new Error('Onvolledige private ticketgegevens; synchronisatie afgebroken.');
  for (const ticket of snapshot.tickets) if (!allItemIds.has(ticket.itemId)) warnings.push(`Ticket zonder corresponderend order-item: ${ticket.id}`);
  for (const order of snapshot.orders) for (const item of items(order)) {
    if (!item.id || seen.has(item.id)) throw new Error('Dubbele of ontbrekende itemId; synchronisatie afgebroken.');
    seen.add(item.id);
    const product = item.product;
    if (product?.type !== 'Ticket') continue;
    const answers = item.fieldAnswers ?? [];
    const mapping = autoDetectMapping(answers.map((a: any) => textValue(a.field?.name)));
    const answer = (key: string) => {
      const chosen = config.mapping[key];
      const a = answers.find((a: any) => chosen ? (a.field?.id === chosen || textValue(a.field?.name) === chosen) : textValue(a.field?.name) === mapping[key]);
      return textValue(a?.answer).trim();
    };
    const linked = snapshot.tickets.filter(t => t.itemId === item.id && t.orderId === order.id);
    const active = linked.filter(t => t.deletedAt === null);
    const ticket = active.length === 1 ? active[0] : undefined;
    const errors: string[] = [];
    if (active.length > 1 || Number(item.amount ?? 1) > 1) errors.push('Meerdere tickets/personen op één item; handmatige controle nodig.');
    if (!answer('firstName') || !answer('lastName')) errors.push('Voornaam of achternaam ontbreekt; controleer veldkoppeling.');
    const payment = paymentStatus(order);
    const raw: StamhoofdRegistration = {
      firstName: answer('firstName'), lastName: answer('lastName'), birthDate: answer('birthDate'), gender: ({ man: 'M', male: 'M', m: 'M', vrouw: 'F', female: 'F', v: 'F', f: 'F', x: 'X' } as Record<string, string>)[answer('gender').toLowerCase()] ?? '',
      product: textValue(product.name), distance: textValue(product.name).match(/\d+(?:[.,]\d+)?\s*km/i)?.[0] ?? '',
      orderNumber: textValue(order.number), paymentStatus: payment,
      email: textValue(order.data?.customer?.email ?? order.data?.email), phone: textValue(order.data?.customer?.phone ?? order.data?.phone),
      ticketId: ticket?.id ?? '', ticketSecret: ticket?.secret ?? '', ticketUrl: ticket?.secret ? ticketUrl(snapshot.shop.domain, ticket.secret) : '',
      scannedAt: ticket?.scannedAt ? new Date(ticket.scannedAt).toISOString() : '', scannedBy: textValue(ticket?.scannedBy),
    };
    const registration: StamhoofdRegistration = { product: raw.product };
    for (const key of config.fields) if (key in importFields) registration[key] = raw[key];
    const customFields: Record<string, string> = {};
    for (const a of answers) {
      const key = a.field?.id || textValue(a.field?.name);
      if (config.fields.includes(`custom:${key}`)) customFields[key] = textValue(a.answer);
    }
    if (Object.keys(customFields).length) registration.customFields = customFields;
    rows.push({ registeredAt: Number.isFinite(Date.parse(order.createdAt)) ? new Date(order.createdAt).toISOString() : undefined, itemId: item.id, orderId: order.id, productId: product.id, updatedAt: textValue(order.updatedAt), registration, inactive: order.status !== 'Created' || (linked.length > 0 && active.length === 0), errors, payment, ticket, change: 'nieuw' });
  }
  return { rows, warnings };
}
export function previewSync(snapshot: StamhoofdSnapshot, config: StamhoofdConfig, participants: Participant[]) {
  const { rows, warnings } = normalize(snapshot, config);
  const local = participants.filter(p => p.stamhoofdEventId === config.id && p.stamhoofdWebshopId === snapshot.shop.id && p.stamhoofdOrganizationId === snapshot.shop.organizationId);
  const byItem = new Map<string, Participant>();
  for (const p of local) {
    if (byItem.has(p.stamhoofdItemId)) throw new Error('Dubbele lokale itemId; los dit eerst op.');
    byItem.set(p.stamhoofdItemId, p);
  }
  for (const row of rows) {
    row.existing = byItem.get(row.itemId);
    if (!row.existing && (!row.registration.firstName || !row.registration.lastName)) row.errors.push('Selecteer voornaam en achternaam voor nieuwe deelnemers.');
    row.change = row.inactive ? 'geannuleerd' : !row.existing ? 'nieuw' : JSON.stringify(row.existing.stamhoofdRegistration) !== JSON.stringify(row.registration) || row.existing.stamhoofdInactive ? 'gewijzigd' : 'ongewijzigd';
  }
  // Absence alone is not a cancellation: API permissions may hide records.
  for (const p of local) if (!rows.some(r => r.itemId === p.stamhoofdItemId)) warnings.push(`Lokale deelnemer ontbreekt in antwoord en blijft behouden: ${p.firstName} ${p.lastName}`);
  return { rows, warnings };
}
export function mergeRegistration(existing: Participant | undefined, row: SyncRow, config: StamhoofdConfig, now: string, categoryId = '', raceProfileId = ''): Participant {
  const next: Participant = existing ? { ...existing } : { id: generateUUID(), firstName: '', lastName: '', status: 'REGISTERED', categoryId, raceProfileId, createdAt: now, updatedAt: now };
  const baseline: Record<string, string> = { ...existing?.stamhoofdBaseline };
  for (const key of ['firstName', 'lastName', 'birthDate', 'email', 'phone', 'gender'] as const) {
    if (row.inactive) continue;
    const value = row.registration[key];
    if (typeof value !== 'string') {
      if (key !== 'firstName' && key !== 'lastName' && existing && existing[key] === baseline[key]) delete next[key];
      delete baseline[key];
      continue;
    }
    if (!existing || (existing[key] ?? '') === (baseline[key] ?? '')) {
      if (key === 'gender') next.gender = value === 'M' || value === 'F' || value === 'X' ? value : undefined;
      else next[key] = value;
    }
    baseline[key] = value;
  }
  return { ...next, article: String(row.registration.product ?? existing?.article ?? ''), stamhoofdEventId: config.id, stamhoofdOrganizationId: config.shop.organizationId, stamhoofdWebshopId: config.shop.id,
    stamhoofdItemId: row.itemId, stamhoofdOrderId: row.orderId,
    stamhoofdTicketId: row.registration.ticketId as string | undefined,
    stamhoofdTicketSecret: row.registration.ticketSecret as string | undefined,
    stamhoofdTicketUrl: row.registration.ticketUrl as string | undefined,
    stamhoofdUpdatedAt: row.updatedAt, stamhoofdRegisteredAt: row.registeredAt ?? existing?.stamhoofdRegisteredAt, stamhoofdLastSyncAt: now, stamhoofdInactive: row.inactive,
    stamhoofdRegistration: row.registration, stamhoofdBaseline: baseline };
}
export async function applySync(snapshot: StamhoofdSnapshot, config: StamhoofdConfig, approvedIds: string[]) {
  return db.transaction('rw', [db.participants, db.categories, db.raceProfiles, db.events, db.stamhoofdConfigs, db.auditLogs], async () => {
    const event = await db.events.get(config.id);
    if (!event) throw new Error('Het lokale evenement bestaat niet meer.');
    const { rows, warnings } = previewSync(snapshot, config, await db.participants.toArray());
    const now = new Date().toISOString();
    const categories = await db.categories.toArray();
    const profiles = await db.raceProfiles.toArray();
    const applied: SyncRow[] = [];
    for (const row of rows) {
      if (!approvedIds.includes(row.itemId) || (row.errors.length && !row.inactive) || (row.inactive && !row.existing)) continue;
      const participant = mergeRegistration(row.existing, row, config, now);
      if (!row.existing) {
        const assignment = classifyParticipant(participant, event.date, categories, profiles);
        participant.categoryId = assignment.categoryId;
        participant.raceProfileId = assignment.raceProfileId;
        participant.categoryAssignment = 'automatic';
        participant.profileAssignment = 'automatic';
      }
      await db.participants.put(participant);
      applied.push(row);
    }
    const report = { webshopId: snapshot.shop.id, orders: snapshot.orders.length, participants: rows.length, applied: applied.length, new: applied.filter(r => r.change === 'nieuw').length, changed: applied.filter(r => r.change === 'gewijzigd').length, cancelled: applied.filter(r => r.inactive).length, withSecret: rows.filter(r => r.ticket?.secret).length, withoutSecret: rows.filter(r => !r.ticket?.secret).length, errors: [...warnings, ...rows.flatMap(r => r.errors)] };
    await db.stamhoofdConfigs.put({ ...config, lastSyncAt: now });
    await operationService.logAudit('STAMHOOFD_SYNC', JSON.stringify(report));
    return report;
  });
}
