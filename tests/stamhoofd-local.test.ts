import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { createLocalStamhoofd, isLocalRequest } from '../server/stamhoofdLocal';

test('local credentials reject LAN clients, DNS rebinding and cross-origin requests', () => {
  const request = (headers = {}, remoteAddress = '127.0.0.1') => ({ socket: { remoteAddress }, headers: { host: 'localhost:3000', 'x-stamhoofd-local': '1', ...headers } }) as unknown as IncomingMessage;
  assert.equal(isLocalRequest(request()), true);
  assert.equal(isLocalRequest(request({}, '192.168.1.2')), false);
  assert.equal(isLocalRequest(request({ host: 'attacker.example:3000' })), false);
  assert.equal(isLocalRequest(request({ origin: 'https://attacker.example' })), false);
  assert.equal(isLocalRequest(request({ 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(isLocalRequest(request({ 'x-stamhoofd-local': undefined })), false);
});

test('search needs no key; sync uses only its request key and never retains it', async () => {
  const middleware = createLocalStamhoofd();
  const server = createServer((req, res) => void middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const transport = globalThis.fetch;
  const local = (route: string, init: RequestInit = {}) => transport(`${base}/api/stamhoofd${route}`, { ...init, headers: { 'X-Stamhoofd-Local': '1', ...init.headers } });
  const syncRoute = '/sync?organizationId=af201d93-dcd6-4cfe-bfc7-ed3d2a209236&webshopId=603e808b-9ac6-47cb-933c-bf7b4c66f357';
  const key = 'request-test-placeholder-'.repeat(3);
  const post = (apiKey: string) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey }) });
  const calls: { url: string; authorization?: string }[] = [];
  let failUpstream = false;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), authorization: (init?.headers as Record<string, string>)?.Authorization });
    if (failUpstream) return new Response(null, { status: 401 });
    if (String(url).includes('/webshop-from-domain')) return Response.json({ organization: { id: 'af201d93-dcd6-4cfe-bfc7-ed3d2a209236' }, webshops: [{ id: '603e808b-9ac6-47cb-933c-bf7b4c66f357', meta: { name: 'Test' } }] });
    if (String(url).includes('/webshop/orders') || String(url).includes('/tickets/private')) return Response.json({ results: [], next: null });
    return Response.json({ id: '603e808b-9ac6-47cb-933c-bf7b4c66f357', meta: { name: 'Test' } });
  };
  try {
    assert.deepEqual(await (await local('/health')).json(), { local: true });
    const search = await local('/webshop/search?domain=shop.example.be');
    assert.equal(search.status, 200);
    assert.equal(calls[0].authorization, undefined);
    const denied = await local(syncRoute, { ...post(key), headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' } });
    assert.equal(denied.status, 403);
    const response = await local(syncRoute, post(key));
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes(key));
    assert.equal(calls.length, 4);
    assert.ok(calls.slice(1).every(call => call.authorization === `Bearer ${key}` && call.url.startsWith('https://af201d93-dcd6-4cfe-bfc7-ed3d2a209236.api.stamhoofd.app/v417/')));
    assert.equal((await local(syncRoute, post(''))).status, 400);
    assert.equal(calls.length, 4);
    assert.equal((await local(syncRoute)).status, 405);
    assert.equal((await local('/configure', post(key))).status, 404);
    failUpstream = true;
    assert.equal((await local(syncRoute, post(key))).status, 502);
    assert.equal((await local(syncRoute, post(''))).status, 400);
    assert.equal(calls.length, 5);
  } finally {
    globalThis.fetch = transport;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
