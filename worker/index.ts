import { paginate } from '../src/services/stamhoofdPagination';
export { paginate } from '../src/services/stamhoofdPagination';
import type { StamhoofdShop } from '../src/types/stamhoofd';

export interface Env {
  STAMHOOFD_API_KEY: string;
  SYNC_ACCESS_TOKEN: string;
  ALLOWED_ORIGIN: string;
  ORGANIZATION_ID: string;
  STAMHOOFD_VERSION: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class ApiError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
export function domainName(value: string): string {
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/' || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) throw new ApiError('Geef een geldig webshopdomein zonder pad op.', 400);
  return url.hostname;
}
function label(value: any): string { return typeof value === 'string' ? value : value?.nl ?? Object.values(value ?? {}).find(v => typeof v === 'string') ?? ''; }
async function authorized(request: Request, env: Env) {
  const supplied = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([digest(supplied), digest(env.SYNC_ACCESS_TOKEN)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff' });
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (origin !== env.ALLOWED_ORIGIN) return reply({ error: 'Origin niet toegestaan (CORS).' }, 403);
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return reply({ error: 'Alleen lezen is toegestaan.' }, 405);
    try {
      const url = new URL(request.url);
      if (url.pathname === '/health') return reply({ ok: true });
      if ((url.pathname === '/sync' && !env.STAMHOOFD_API_KEY) || !env.SYNC_ACCESS_TOKEN || env.SYNC_ACCESS_TOKEN.length < 32 || !uuid.test(env.ORGANIZATION_ID) || !/^v\d+$/.test(env.STAMHOOFD_VERSION)) throw new ApiError('Worker is nog niet volledig geconfigureerd.', 503);
      if (!await authorized(request, env)) throw new ApiError('Ongeldige Worker-toegangscode.', 401);
      let lastRequest = 0;
      const get = async (path: string, global = false) => {
        const delay = 1050 - (Date.now() - lastRequest);
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
        lastRequest = Date.now();
        const host = global ? 'api.stamhoofd.app' : `${env.ORGANIZATION_ID}.api.stamhoofd.app`;
        const response = await fetch(`https://${host}/${env.STAMHOOFD_VERSION}${path}`, {
          headers: global ? {} : { Authorization: `Bearer ${env.STAMHOOFD_API_KEY}` },
          redirect: 'error', signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) throw new ApiError(response.status === 401 ? 'Stamhoofd API-key ongeldig.' : response.status === 403 ? 'Onvoldoende Stamhoofd API-rechten.' : response.status === 404 ? 'Webshop niet gevonden.' : response.status === 429 ? 'Stamhoofd aanvraaglimiet bereikt. Probeer later opnieuw.' : 'Stamhoofd niet bereikbaar.');
        return response.json();
      };
      if (url.pathname === '/webshop/search') {
        const domain = domainName(url.searchParams.get('domain') ?? '');
        const result: any = await get(`/webshop-from-domain?${new URLSearchParams({ domain })}`, true);
        if (result.organization?.id !== env.ORGANIZATION_ID) throw new ApiError('Webshop hoort niet bij de ingestelde organisatie.', 403);
        const shops: StamhoofdShop[] = (result.webshop ? [result.webshop] : result.webshops ?? []).map((w: any) => ({ id: w.id, organizationId: env.ORGANIZATION_ID, domain, name: label(w.meta?.name ?? w.name) }));
        return reply({ shops });
      }
      if (url.pathname === '/sync') {
        const webshopId = url.searchParams.get('webshopId') ?? '';
        if (!uuid.test(webshopId) || url.searchParams.get('organizationId') !== env.ORGANIZATION_ID) throw new ApiError('Ongeldige organisatie of webshop.', 400);
        const webshop: any = await get(`/webshop/${webshopId}`);
        const orders = await paginate(get, '/webshop/orders', webshopId, 'updatedAt ASC,number ASC,id ASC');
        const tickets = await paginate(get, '/webshop/tickets/private', webshopId, 'updatedAt ASC,id ASC');
        return reply({ webshop, orders, tickets, fetchedAt: new Date().toISOString(), shop: { id: webshopId, organizationId: env.ORGANIZATION_ID, name: label(webshop.meta?.name ?? webshop.name) } });
      }
      return reply({ error: 'Endpoint niet gevonden.' }, 404);
    } catch (error) {
      // Never log upstream response bodies, headers, ticket secrets or credentials.
      const message = error instanceof ApiError ? error.message : 'Stamhoofd niet bereikbaar of ongeldig antwoord.';
      console.error('Stamhoofd Worker:', message);
      return reply({ error: message }, error instanceof ApiError ? error.status : 502);
    }
  },
};
