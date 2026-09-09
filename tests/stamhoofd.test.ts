import 'fake-indexeddb/auto';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import Dexie from 'dexie';
import { BiathlonDatabase, db } from '../src/db/dexieDb';
import { applySync, defaultFields, mergeRegistration, normalize, paymentStatus, previewSync, ticketUrl } from '../src/services/stamhoofdSync';
import { parseCSVText, autoDetectMapping, validateAndMapRows } from '../src/services/stamhoofdParser';
import { runFailsafeTestSuite } from '../src/services/failsafeTests';
import type { StamhoofdConfig, StamhoofdSnapshot } from '../src/types/stamhoofd';
import worker, { paginate, type Env } from '../worker/index';

const shop = { id: '603e808b-9ac6-47cb-933c-bf7b4c66f357', organizationId: 'af201d93-dcd6-4cfe-bfc7-ed3d2a209236', name: 'Test', domain: 'shop.example.be' };
const config: StamhoofdConfig = { id: 'event', shop, domain: shop.domain, workerUrl: 'https://worker.example.be', fields: defaultFields, mapping: {}, productCategories: { product: 'category' } };
function fixture(): StamhoofdSnapshot {
  return { shop, webshop: {}, fetchedAt: '2026-09-07T10:00:00Z', orders: [{ id: 'order', status: 'Created', number: 1, updatedAt: '2026-09-07', balanceItems: [{ payments: [{ payment: { status: 'Succeeded' } }] }], data: { cart: { items: [{ id: 'item', product: { id: 'product', type: 'Ticket', name: 'Korte afstand (4 km)' }, fieldAnswers: [{ field: { id: 'first', name: 'Voornaam deelnemer' }, answer: 'Louize' }, { field: { id: 'last', name: 'Achternaam deelnemer' }, answer: 'Test' }] }] } } }], tickets: [{ id: 'ticket', itemId: 'item', orderId: 'order', secret: 'TESTSECRET', deletedAt: null, scannedAt: null, scannedBy: null }] };
}
after(async () => {
  assert.equal(db.name, 'BiathlonDeHaanDB-node-test');
  await db.delete();
});
test('orders normalize, link by itemId, payment and ticket URL independent of bib', () => {
  const { rows } = normalize(fixture(), config);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].registration.firstName, 'Louize');
  assert.equal(rows[0].registration.distance, '4 km');
  assert.equal(rows[0].payment, 'Betaald');
  assert.equal(rows[0].registration.ticketUrl, 'https://shop.example.be/tickets/TESTSECRET');
  assert.equal(mergeRegistration(undefined, rows[0], config, 'now').bibNumber, undefined);
  assert.equal(ticketUrl('next.example.be', 'AB/C'), 'https://next.example.be/tickets/AB%2FC');
  const dated = fixture();
  dated.orders[0].createdAt = '2026-08-01T09:15:00Z';
  const source = normalize(dated, config).rows[0];
  assert.equal(mergeRegistration(undefined, source, config, 'now').stamhoofdRegisteredAt, '2026-08-01T09:15:00.000Z');
});
test('deleted orders/tickets, wrong order linkage, missing secrets and orphan tickets', () => {
  const data = fixture();
  data.orders[0].status = 'Deleted';
  assert.equal(normalize(data, config).rows[0].inactive, true);
  data.orders[0].status = 'Created';
  data.tickets[0].deletedAt = '2026-09-07';
  let result = normalize(data, config);
  assert.equal(result.rows[0].inactive, true);
  assert.equal(result.rows[0].registration.ticketSecret, '');
  data.tickets[0].deletedAt = null;
  data.tickets[0].orderId = 'wrong';
  assert.equal(normalize(data, config).rows[0].ticket, undefined);
  data.tickets[0].itemId = 'orphan';
  result = normalize(data, config);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.rows[0].inactive, false);
});
test('duplicates, ambiguous quantities, malformed orders fail safely', () => {
  const data = fixture();
  data.orders.push(structuredClone(data.orders[0]));
  assert.throws(() => normalize(data, config), /itemId/);
  const quantity = fixture(); quantity.orders[0].data.cart.items[0].amount = 2;
  assert.ok(normalize(quantity, config).rows[0].errors.length);
  assert.throws(() => normalize({ ...fixture(), orders: [{ id: 'bad' }] }, config), /cart/);
});
test('payment failures and missing payment are never silently treated as paid', () => {
  assert.equal(paymentStatus({}), 'Onbekend');
  assert.equal(paymentStatus({ balanceItems: [{ payments: [{ payment: { status: 'Failed' } }] }] }), 'Mislukt');
  assert.equal(paymentStatus({ balanceItems: [{ payments: [{ payment: { status: 'Pending' } }] }] }), 'In behandeling');
});
test('field opt-out and manual corrections preserve local race data', () => {
  const row = normalize(fixture(), config).rows[0];
  const initial = mergeRegistration(undefined, row, config, 'first');
  const local = { ...initial, firstName: 'Manueel', bibNumber: 125, waveId: 'wave', status: 'FINISHED' as const, notes: 'correctie', statusReason: 'jury' };
  row.registration.firstName = 'Extern gewijzigd';
  const next = mergeRegistration(local, row, config, 'second');
  for (const key of ['firstName', 'bibNumber', 'waveId', 'status', 'notes', 'statusReason', 'createdAt', 'updatedAt']) assert.equal(next[key], local[key]);
  const privateConfig = { ...config, fields: ['firstName', 'lastName'] };
  const privateRow = normalize(fixture(), privateConfig).rows[0];
  const minimized = mergeRegistration(next, privateRow, privateConfig, 'third');
  assert.equal(minimized.stamhoofdTicketSecret, undefined);
  assert.equal(minimized.stamhoofdItemId, 'item');
});
test('pagination follows pageFilter with string sort and fixed scope', async () => {
  const calls: URL[] = [];
  const result = await paginate(async path => {
    const url = new URL(path, 'https://example.be'); calls.push(url);
    return calls.length === 1 ? { results: Array.from({ length: 100 }, (_, i) => ({ id: String(i) })), next: { pageFilter: { id: { $gt: '99' } }, filter: { webshopId: 'evil' } } } : { results: [{ id: '100' }], next: null };
  }, '/webshop/orders', shop.id, 'updatedAt ASC,number ASC,id ASC');
  assert.equal(result.length, 101);
  assert.equal(calls[1].searchParams.get('sort'), 'updatedAt ASC,number ASC,id ASC');
  assert.deepEqual(JSON.parse(calls[1].searchParams.get('filter')), { webshopId: shop.id });
  assert.deepEqual(JSON.parse(calls[1].searchParams.get('pageFilter')), { id: { $gt: '99' } });
  let page = 0;
  await assert.rejects(paginate(async () => ({ results: [{ id: String(page++) }], next: { pageFilter: { id: 'same' } } }), '/webshop/orders', shop.id, 'id ASC'), /Herhaalde/);
});
test('Worker rejects unauthenticated, cross-origin and invalid organization requests without upstream calls', async () => {
  const env: Env = { STAMHOOFD_API_KEY: 'test-upstream-placeholder', SYNC_ACCESS_TOKEN: 'test-only-'.repeat(5), ALLOWED_ORIGIN: 'https://timgaatervoor.github.io', ORGANIZATION_ID: shop.organizationId, STAMHOOFD_VERSION: 'v417' };
  assert.equal((await worker.fetch(new Request('https://worker.test/health', { headers: { Origin: env.ALLOWED_ORIGIN } }), env)).status, 200);
  assert.equal((await worker.fetch(new Request('https://worker.test/sync'), env)).status, 403);
  assert.equal((await worker.fetch(new Request('https://worker.test/sync', { headers: { Origin: env.ALLOWED_ORIGIN } }), env)).status, 401);
  assert.equal((await worker.fetch(new Request('https://worker.test/sync?organizationId=bad', { headers: { Origin: env.ALLOWED_ORIGIN, Authorization: `Bearer ${env.SYNC_ACCESS_TOKEN}` } }), env)).status, 400);
});
test('Worker search and full sync keep API credentials server-side', async () => {
  const env: Env = { STAMHOOFD_API_KEY: 'test-upstream-placeholder', SYNC_ACCESS_TOKEN: 'test-only-'.repeat(5), ALLOWED_ORIGIN: 'https://timgaatervoor.github.io', ORGANIZATION_ID: shop.organizationId, STAMHOOFD_VERSION: 'v417' };
  const originalFetch = globalThis.fetch;
  const requests: { url: URL; authorization: string | undefined }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const authorization = (init?.headers as Record<string, string>)?.Authorization;
    requests.push({ url, authorization });
    if (url.pathname.endsWith('/webshop-from-domain')) return Response.json({ organization: { id: shop.organizationId }, webshops: [{ id: shop.id, meta: { name: 'Test shop' } }] });
    if (url.pathname.endsWith('/webshop/orders')) return Response.json({ results: fixture().orders, next: null });
    if (url.pathname.endsWith('/webshop/tickets/private')) return Response.json({ results: fixture().tickets, next: null });
    return Response.json({ id: shop.id, meta: { name: 'Test shop' } });
  };
  try {
    const headers = { Origin: env.ALLOWED_ORIGIN, Authorization: `Bearer ${env.SYNC_ACCESS_TOKEN}` };
    const search = await worker.fetch(new Request(`https://worker.test/webshop/search?domain=${shop.domain}`, { headers }), env);
    assert.equal((await search.json() as any).shops[0].domain, shop.domain);
    assert.equal(requests[0].authorization, undefined);
    const sync = await worker.fetch(new Request(`https://worker.test/sync?organizationId=${shop.organizationId}&webshopId=${shop.id}`, { headers }), env);
    const body = await sync.text();
    assert.equal(sync.status, 200);
    assert.equal(JSON.parse(body).orders.length, 1);
    assert.ok(!body.includes(env.STAMHOOFD_API_KEY));
    assert.ok(!body.includes(env.SYNC_ACCESS_TOKEN));
    assert.ok(requests.slice(1).every(r => r.authorization === `Bearer ${env.STAMHOOFD_API_KEY}` && r.url.hostname === `${shop.organizationId}.api.stamhoofd.app`));
  } finally { globalThis.fetch = originalFetch; }
});
test('v2 to v3 migration retains participants, timing, shooting and audit data', async () => {
  const name = 'migration-test';
  const legacy = new Dexie(name);
  legacy.version(2).stores({ participants: 'id, externalId, bibNumber, waveId, categoryId, status, [categoryId+status]', timingRecords: 'id, eventId, participantId, bibNumber, type, timestamp, syncStatus, [bibNumber+type]', shootingResults: 'id, eventId, participantId, bibNumber, round, [participantId+round], syncStatus', auditLogs: 'id, timestamp, action, participantId, bibNumber' });
  const records = { participants: { id: 'local', bibNumber: 125, status: 'FINISHED', waveId: 'wave' }, timingRecords: { id: 'time', participantId: 'local', timestamp: '2026-09-07' }, shootingResults: { id: 'shoot', misses: 2 }, auditLogs: { id: 'audit', action: 'CORRECTION' } };
  for (const [table, record] of Object.entries(records)) await legacy.table(table).put(record);
  legacy.close();
  const upgraded = new BiathlonDatabase(name);
  await upgraded.open();
  for (const [table, record] of Object.entries(records)) assert.deepEqual(await upgraded.table(table).get(record.id), record);
  await upgraded.stamhoofdConfigs.put(config);
  assert.deepEqual(await upgraded.stamhoofdConfigs.get(config.id), config);
  await upgraded.delete();
});
test('transactional resync is idempotent and cancellation retains offline race records', async () => {
  await db.events.put({ id: config.id } as any);
  await db.categories.put({ id: 'category', raceProfileId: 'profile', raceProfileIds: ['profile'] } as any);
  await applySync(fixture(), config, ['item']);
  let participant = await db.participants.toCollection().first();
  await db.participants.update(participant.id, { bibNumber: 125, waveId: 'local', status: 'FINISHED' });
  await db.timingRecords.put({ id: 'time', participantId: participant.id, timestamp: 'local-time' } as any);
  await db.shootingResults.put({ id: 'shoot', participantId: participant.id, misses: 3 } as any);
  await applySync(fixture(), config, ['item']);
  assert.equal(await db.participants.count(), 1);
  assert.equal(previewSync(fixture(), config, await db.participants.toArray()).rows[0].change, 'ongewijzigd');
  const deleted = fixture(); deleted.orders[0].status = 'Deleted';
  await applySync(deleted, config, ['item']);
  participant = await db.participants.get(participant.id);
  assert.equal(participant.bibNumber, 125);
  assert.equal(participant.status, 'FINISHED');
  assert.equal(participant.waveId, 'local');
  assert.equal(participant.stamhoofdInactive, true);
  assert.equal((await db.timingRecords.get('time')).timestamp, 'local-time');
  assert.equal((await db.shootingResults.get('shoot')).misses, 3);
  assert.equal(await db.auditLogs.where('action').equals('STAMHOOFD_SYNC').count(), 3);
});
test('CSV import and existing failsafe suite', async () => {
  const csv = parseCSVText('Voornaam;Achternaam;Startnummer\nLotte;Test;125');
  const candidates = validateAndMapRows(csv.rows, autoDetectMapping(csv.headers), []);
  assert.equal(candidates[0].firstName, 'Lotte');
  assert.equal(candidates[0].bibNumber, 125);
  const results = await runFailsafeTestSuite();
  assert.deepEqual(results.filter(r => !r.passed).map(r => `${r.name}: ${r.message}`), []);
});
