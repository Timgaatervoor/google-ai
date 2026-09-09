import type { StamhoofdShop, StamhoofdSnapshot } from '../types/stamhoofd';
import { paginate } from './stamhoofdPagination';

export const DIRECT_STAMHOOFD = 'direct';
const version = 'v417';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


// Matches the user's working HTML: credentials exist only for this fetch flow.
// Never use storage, log request headers, or surface raw upstream error bodies.
async function getJson(url: string, apiKey?: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET', headers: {
        Accept: 'application/json', 'X-Platform': 'web', 'X-Locale': 'nl-BE',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error('Stamhoofd niet bereikbaar. Controleer internet. Als de browser de aanvraag blokkeert (CORS), kun je onder andere webshop of verbinding de lokale koppeling kiezen.');
  }
  if (!response.ok) {
    const endpoint = new URL(url).pathname;
    const resource = endpoint.endsWith('/tickets/private') ? 'Tickets' : endpoint.endsWith('/orders') ? 'Orders' : 'Webshop';
    console.error('Stamhoofd-aanvraag mislukt:', endpoint, response.status);
    throw new Error(response.status === 401 ? 'API-key ongeldig.' : response.status === 403 ? 'Onvoldoende API-rechten.' : response.status === 404 ? 'Webshop niet gevonden.' : response.status === 429 ? 'Stamhoofd aanvraaglimiet bereikt. Probeer later opnieuw.' : `${resource} konden niet worden opgehaald (HTTP ${response.status}).`);
  }
  try { return await response.json(); } catch { throw new Error('Stamhoofd gaf geen geldig JSON-antwoord.'); }
}

export async function searchDirectShops(domain: string): Promise<{ shops: StamhoofdShop[] }> {
  const url = new URL(domain.includes('://') ? domain : `https://${domain}`);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw new Error('Geef alleen het webshopdomein op.');
  const data = await getJson(`https://api.stamhoofd.app/${version}/webshop-from-domain?${new URLSearchParams({ domain: url.hostname })}`);
  if (!uuid.test(data.organization?.id)) throw new Error('Ongeldige organisatie in webshopantwoord.');
  return { shops: (data.webshop ? [data.webshop] : data.webshops ?? []).map((shop: any) => ({
    id: shop.id, organizationId: data.organization.id, domain: url.hostname,
    name: typeof shop.meta?.name === 'string' ? shop.meta.name : shop.meta?.name?.nl ?? shop.name ?? shop.id,
  })) };
}

export async function loadDirectStamhoofd(shop: StamhoofdShop, apiKey: string, progress?: (text: string) => void): Promise<StamhoofdSnapshot> {
  if (!apiKey?.trim()) throw new Error('Vul eerst je API-key in.');
  if (!uuid.test(shop.organizationId) || !uuid.test(shop.id)) throw new Error('Ongeldige organisatie of webshop.');
  const base = `https://${shop.organizationId}.api.stamhoofd.app/${version}`;
  let lastRequest = 0;
  let count = 0;
  const get = async (path: string) => {
    const wait = 1050 - (Date.now() - lastRequest);
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequest = Date.now();
    progress?.(`${path.startsWith('/webshop/tickets') ? 'Tickets' : path.startsWith('/webshop/orders') ? 'Orders' : 'Webshop'} ophalen — aanvraag ${++count}`);
    return getJson(`${base}${path}`, apiKey.trim());
  };
  const webshop = await get(`/webshop/${shop.id}`);
  const orders = await paginate(get, '/webshop/orders', shop.id, 'updatedAt ASC,number ASC,id ASC');
  const tickets = await paginate(get, '/webshop/tickets/private', shop.id, 'updatedAt ASC,id ASC');
  return { shop, webshop, orders, tickets, fetchedAt: new Date().toISOString() };
}
