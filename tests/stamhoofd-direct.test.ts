const defaultStamhoofdShop = {
  id: '603e808b-9ac6-47cb-933c-bf7b4c66f357',
  organizationId: 'af201d93-dcd6-4cfe-bfc7-ed3d2a209236',
  domain: 'shop.kidsatletiekdehaan.be',
  name: 'Run Biathlon De Haan 19 sept. 2026',
};
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDirectStamhoofd, searchDirectShops } from '../src/services/stamhoofdDirect';

test('direct HTML-style requests use matching headers, pagination and only the supplied key', async () => {
  const original = globalThis.fetch;
  const calls: { url: URL; init: RequestInit }[] = [];
  const key = 'direct-test-placeholder';
  const progress: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push({ url, init });
    if (url.pathname.endsWith('/webshop-from-domain')) return Response.json({ organization: { id: defaultStamhoofdShop.organizationId }, webshop: { id: defaultStamhoofdShop.id, meta: { name: 'Test shop' } } });
    if (url.pathname.endsWith('/webshop/orders')) {
      if (url.searchParams.has('pageFilter')) {
        assert.deepEqual(JSON.parse(url.searchParams.get('pageFilter')), { id: { $gt: 'order-99' } });
        return Response.json({ results: [{ id: 'order-100' }], next: null });
      }
      return Response.json({ results: Array.from({ length: 100 }, (_, i) => ({ id: `order-${i}` })), next: { pageFilter: JSON.stringify({ id: { $gt: 'order-99' } }) } });
    }
    if (url.pathname.endsWith('/tickets/private')) return Response.json({ results: [{ id: 'ticket', secret: 'TESTSECRET', itemId: 'item', orderId: 'order-0', deletedAt: null }], next: null });
    return Response.json({ id: defaultStamhoofdShop.id });
  };
  try {
    await assert.rejects(loadDirectStamhoofd(defaultStamhoofdShop, ''), /API-key/);
    assert.equal(calls.length, 0);
    const search = await searchDirectShops(defaultStamhoofdShop.domain);
    assert.equal(search.shops[0].id, defaultStamhoofdShop.id);
    assert.equal((calls[0].init.headers as any).Authorization, undefined);
    const data = await loadDirectStamhoofd(defaultStamhoofdShop, key, message => progress.push(message));
    assert.equal(data.orders.length, 101);
    assert.equal(data.tickets[0].secret, 'TESTSECRET');
    assert.equal(calls.length, 5);
    assert.equal(progress.length, 4);
    for (const call of calls.slice(1)) {
      assert.equal(call.url.hostname, `${defaultStamhoofdShop.organizationId}.api.stamhoofd.app`);
      assert.ok(!call.url.href.includes(key));
      assert.deepEqual(call.init.headers, { Accept: 'application/json', 'X-Platform': 'web', 'X-Locale': 'nl-BE', Authorization: `Bearer ${key}` });
      assert.equal(call.init.credentials, 'omit');
      assert.equal(call.init.redirect, 'error');
    }
    assert.equal(calls[2].url.searchParams.get('sort'), 'updatedAt ASC,number ASC,id ASC');
    assert.equal(calls[4].url.searchParams.get('sort'), 'updatedAt ASC,id ASC');
    assert.ok(!JSON.stringify(data).includes(key));
    await assert.rejects(loadDirectStamhoofd(defaultStamhoofdShop, ''), /API-key/);
    assert.equal(calls.length, 5);
  } finally { globalThis.fetch = original; }
});

test('direct failures do not echo credentials and invalid organization cannot redirect the key', async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return Response.json({ error: 'sensitive-upstream-body' }, { status: 401 }); };
  try {
    await assert.rejects(loadDirectStamhoofd({ ...defaultStamhoofdShop, organizationId: 'attacker.example' }, 'placeholder'), /Ongeldige/);
    assert.equal(called, false);
    await assert.rejects(loadDirectStamhoofd(defaultStamhoofdShop, 'placeholder'), { message: 'API-key ongeldig.' });
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(loadDirectStamhoofd(defaultStamhoofdShop, 'placeholder'), /CORS/);
  } finally { globalThis.fetch = original; }
});
