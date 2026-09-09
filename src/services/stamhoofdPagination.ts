export async function paginate(get: (path: string) => Promise<any>, path: string, webshopId: string, sort: string) {
  const rows: Record<string, any>[] = [];
  const seen = new Set<string>();
  const ids = new Set<string>();
  let pageFilter: unknown;
  for (let page = 0; page < 60; page++) {
    const query = new URLSearchParams({ filter: JSON.stringify({ webshopId }), sort, limit: '100' });
    // v417 encodes next.pageFilter as JSON text already. Serializing that text
    // again turns the filter into a JSON string and causes an upstream HTTP 500.
    if (pageFilter !== undefined) query.set('pageFilter', typeof pageFilter === 'string' ? pageFilter : JSON.stringify(pageFilter));
    if (seen.has(query.toString())) throw new Error('Herhaalde paginering; synchronisatie afgebroken.');
    seen.add(query.toString());
    const result = await get(`${path}?${query}`);
    if (!Array.isArray(result.results)) throw new Error('Onverwacht paginaformaat van Stamhoofd.');
    for (const row of result.results) {
      if (typeof row.id !== 'string' || ids.has(row.id)) throw new Error('Dubbele of ontbrekende ID in paginering.');
      if (row.webshopId && row.webshopId !== webshopId) throw new Error('Onverwachte webshop in antwoord.');
      ids.add(row.id);
      rows.push(row);
    }
    if (rows.length > 5000) throw new Error('Meer dan 5000 resultaten; geen gedeeltelijke import uitgevoerd.');
    if (result.next == null) return rows;
    if (!result.next.pageFilter || !result.results.length) throw new Error('Ongeldige volgende pagina van Stamhoofd.');
    pageFilter = result.next.pageFilter;
  }
  throw new Error('Paginaveiligheidslimiet bereikt.');
}
