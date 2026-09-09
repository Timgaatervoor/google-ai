import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import worker from '../worker/index';

export const localPrefix = '/api/stamhoofd';
const organizationId = 'af201d93-dcd6-4cfe-bfc7-ed3d2a209236';
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// Only the app on this computer can use the credentials. Origin/Host checks
// prevent cross-site requests and DNS rebinding; the custom header requires
// a preflight for cross-origin browser requests, which we never allow.
export function isLocalRequest(request: IncomingMessage): boolean {
  if (!loopbackAddresses.has(request.socket.remoteAddress ?? '')) return false;
  const host = request.headers.host ?? '';
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return false;
  if (request.headers['x-stamhoofd-local'] !== '1') return false;
  if (request.headers.origin && request.headers.origin !== `http://${host}` && request.headers.origin !== `https://${host}`) return false;
  if (request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin') return false;
  return true;
}

export function createLocalStamhoofd() {
  const accessToken = randomBytes(32).toString('hex');
  let syncing = false;
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== localPrefix && !url.pathname.startsWith(`${localPrefix}/`)) return next();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status: number, body: unknown) => { response.statusCode = status; response.end(JSON.stringify(body)); };
    if (!isLocalRequest(request)) return reply(403, { error: 'Open deze koppeling op deze computer via localhost.' });
    const route = url.pathname.slice(localPrefix.length);
    try {
      if (route === '/health' && request.method === 'GET') return reply(200, { local: true });
      if (route !== '/webshop/search' && route !== '/sync') return reply(404, { error: 'Endpoint niet gevonden.' });
      if (request.method !== (route === '/sync' ? 'POST' : 'GET')) return reply(405, { error: 'Deze actie wordt niet ondersteund.' });
      let apiKey = '';
      if (route === '/sync') {
        if (!request.headers['content-type']?.startsWith('application/json')) return reply(415, { error: 'JSON verwacht.' });
        let body = '';
        for await (const chunk of request) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 8192) return reply(413, { error: 'Invoer te groot.' });
        }
        try { apiKey = JSON.parse(body).apiKey; } catch { return reply(400, { error: 'Ongeldige invoer.' }); }
        if (typeof apiKey !== 'string' || !apiKey.trim() || /[\s"'\\#\r\n]/.test(apiKey.trim()) || apiKey.length > 4096) return reply(400, { error: 'Vul een geldige Stamhoofd API-key in.' });
        apiKey = apiKey.trim();
      }
      if (syncing) return reply(409, { error: 'Er loopt al een Stamhoofd-aanvraag op deze computer. Wacht tot deze klaar is.' });
      syncing = true;
      try {
        // Reuse exactly the same read-only endpoints and pagination as the
        // optional Worker. Both authorization headers are added server-side.
        const origin = `http://${request.headers.host}`;
        const result = await worker.fetch(new Request(`${origin}${route}${url.search}`, {
          headers: { Origin: origin, Authorization: `Bearer ${accessToken}` },
        }), {
          STAMHOOFD_API_KEY: apiKey, SYNC_ACCESS_TOKEN: accessToken,
          ALLOWED_ORIGIN: origin, ORGANIZATION_ID: organizationId, STAMHOOFD_VERSION: 'v417',
        });
        const body = await result.text();
        response.statusCode = result.status;
        response.end(body);
      } finally { apiKey = ''; syncing = false; }
    } catch {
      // Do not log request bodies or filesystem/environment contents.
      console.error('Lokale Stamhoofd-koppeling: aanvraag mislukt.');
      reply(500, { error: 'De lokale koppeling kon de aanvraag niet uitvoeren. Controleer de verbinding.' });
    }
  };
}

export function stamhoofdLocalPlugin(): Plugin {
  return {
    name: 'stamhoofd-local',
    configureServer(server) { server.middlewares.use(createLocalStamhoofd()); },
    configurePreviewServer(server) { server.middlewares.use(createLocalStamhoofd()); },
  };
}
