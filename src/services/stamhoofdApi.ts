import type { StamhoofdConfig, StamhoofdShop, StamhoofdSnapshot } from '../types/stamhoofd';
import { syncService } from './syncService';
import { DIRECT_STAMHOOFD, searchDirectShops, loadDirectStamhoofd } from './stamhoofdDirect';

export const LOCAL_STAMHOOFD = '/api/stamhoofd';
export function isLocalApp(): boolean {
  return typeof location !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}
async function localRequest<T>(path: string, apiKey?: string): Promise<T> {
  if (!isLocalApp()) throw new Error('Start de app op je computer via start-windows.bat of start-mac-linux.sh.');
  const response = await fetch(`${LOCAL_STAMHOOFD}${path}`, {
    method: apiKey === undefined ? 'GET' : 'POST',
    headers: { 'X-Stamhoofd-Local': '1', ...(apiKey === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: apiKey === undefined ? undefined : JSON.stringify({ apiKey }),
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(180000),
  });
  if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error('Herstart de lokale app om de Stamhoofd-koppeling te activeren.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Lokale koppeling niet bereikbaar.');
  return data;
}
export const localConnectionStatus = () => localRequest<{ local: boolean }>('/health');

export async function workerRequest<T>(workerUrl: string, path: string, accessToken: string, apiKey?: string): Promise<T> {
  if (!navigator.onLine || syncService.getIsSimulatedOffline()) throw new Error('Je bent offline. Lokale wedstrijdregistratie blijft beschikbaar.');
  if (workerUrl === LOCAL_STAMHOOFD) {
    try { return await localRequest<T>(path, apiKey); }
    catch (error) {
      if (error instanceof TypeError) throw new Error('Lokale koppeling niet bereikbaar. Herstart de app op deze computer.');
      throw error;
    }
  }
  const base = new URL(workerUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Gebruik een HTTPS Worker URL zonder pad of aanmeldgegevens.');
  let response: Response;
  try {
    response = await fetch(new URL(path, base), { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(180000) });
  } catch {
    console.error('Worker-request mislukt: netwerk, timeout of CORS.');
    throw new Error('Worker niet bereikbaar. Controleer internet, Worker URL en de CORS-origin.');
  }
  const data = await response.json();
  if (!response.ok) {
    console.error('Worker-request geweigerd:', response.status);
    throw new Error(data.error || 'Worker kon de aanvraag niet uitvoeren.');
  }
  return data;
}
export function searchShops(url: string, domain: string, token: string) {
  if (url === DIRECT_STAMHOOFD) return searchDirectShops(domain);
  return workerRequest<{ shops: StamhoofdShop[] }>(url, `/webshop/search?${new URLSearchParams({ domain })}`, token);
}
export async function loadStamhoofd(config: StamhoofdConfig, token: string, apiKey?: string, progress?: (text: string) => void): Promise<StamhoofdSnapshot> {
  if (!config.shop) throw new Error('Selecteer eerst een webshop.');
  if (config.workerUrl === DIRECT_STAMHOOFD) {
    if (!navigator.onLine || syncService.getIsSimulatedOffline()) throw new Error('Je bent offline. Lokale wedstrijdregistratie blijft beschikbaar.');
    return loadDirectStamhoofd(config.shop, apiKey, progress);
  }
  const data = await workerRequest<StamhoofdSnapshot>(config.workerUrl, `/sync?${new URLSearchParams({ organizationId: config.shop.organizationId, webshopId: config.shop.id })}`, token, apiKey);
  if (data.shop.id !== config.shop.id || data.shop.organizationId !== config.shop.organizationId || !Array.isArray(data.orders) || !Array.isArray(data.tickets) || !data.webshop) throw new Error('Onvolledig synchronisatieantwoord.');
  return { ...data, shop: config.shop };
}
