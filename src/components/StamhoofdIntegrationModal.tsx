import React, { useEffect, useMemo, useState } from 'react';
import { classifyParticipant } from '../services/participantClassification';
import type { RaceProfile, Category, Participant } from '../types';
import type { StamhoofdConfig, StamhoofdShop, StamhoofdSnapshot } from '../types/stamhoofd';
import { db } from '../db/dexieDb';
import { searchShops, loadStamhoofd, LOCAL_STAMHOOFD, isLocalApp } from '../services/stamhoofdApi';
import { DIRECT_STAMHOOFD } from '../services/stamhoofdDirect';
import { applySync, defaultFields, discoverFields, importFields, previewSync } from '../services/stamhoofdSync';

const input = 'w-full bg-slate-800 border border-slate-600 rounded-lg p-2 text-white';
const button = 'px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-40';
export function StamhoofdIntegrationModal({ participants, categories, onClose, onRefresh }: { participants: Participant[]; categories: Category[]; onClose: () => void; onRefresh: () => void }) {
  const [config, setConfig] = useState<StamhoofdConfig>({ id: '', workerUrl: DIRECT_STAMHOOFD, domain: '', fields: defaultFields, mapping: {}, productCategories: {} });
  const [profiles, setProfiles] = useState<RaceProfile[]>([]);
  const [eventDate, setEventDate] = useState('');
  const [token, setToken] = useState(''); // Worker access only; never persisted.
  const [apiKey, setApiKey] = useState('');
  const localMode = config.workerUrl === LOCAL_STAMHOOFD;
  const directMode = config.workerUrl === DIRECT_STAMHOOFD;
  const needsKey = localMode || directMode;
  const [shops, setShops] = useState<StamhoofdShop[]>([]);
  const [selected, setSelected] = useState('');
  const [snapshot, setSnapshot] = useState<StamhoofdSnapshot>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [approved, setApproved] = useState<string[]>([]);
  useEffect(() => { void (async () => {
    try {
      const event = await db.events.toCollection().first();
      if (!event) throw new Error('Maak eerst een lokaal evenement aan.');
      setEventDate(event.date);
      setProfiles(await db.raceProfiles.toArray());
      const saved = await db.stamhoofdConfigs.get(event.id);
      setConfig(c => saved ? { ...saved, workerUrl: DIRECT_STAMHOOFD, shop: saved.shop } : { ...c, id: event.id });
    } catch (e) { setError((e as Error).message); }
  })(); }, []);
  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label); setError(''); setMessage('');
    try { await action(); } catch (e) { setError((e as Error).message); console.error('Stamhoofd:', (e as Error).message); } finally { setBusy(''); }
  };
  const update = (patch: Partial<StamhoofdConfig>) => { setConfig(c => ({ ...c, ...patch })); setShowPreview(false); };
  const analysis = useMemo(() => {
    if (!snapshot) return undefined;
    try { return { ...previewSync(snapshot, config, participants), fields: discoverFields(snapshot), error: '' }; }
    catch (e) { return { rows: [], warnings: [], fields: [], error: (e as Error).message }; }
  }, [snapshot, config, participants]);
  const products = [...new Map<string, string>(analysis?.rows.map(r => [r.productId, String(r.registration.product || r.productId)] as [string, string]) ?? []).entries()];
  return <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-6" role="dialog" aria-modal="true" aria-label="Stamhoofd integratie">
    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto p-5 space-y-5 text-slate-200">
      <div className="flex justify-between gap-3"><h2 className="text-xl font-bold">Stamhoofd synchronisatie</h2><button disabled={!!busy} onClick={onClose} className={button}>Sluiten</button></div>
      <p className="text-sm text-slate-400">Registratiebron voor dit evenement. Ticket secret is geen borstnummer. Laatste sync: {config.lastSyncAt ? new Date(config.lastSyncAt).toLocaleString('nl-BE') : 'nog niet uitgevoerd'}.</p>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      {message && <p role="status" className="text-emerald-300">{message}</p>}
      {busy && <p role="status" className="text-blue-300 animate-pulse">{busy} — even geduld, alle pagina’s worden verwerkt.</p>}
      <fieldset disabled={!!busy || !config.id} className="space-y-4 disabled:opacity-70">
        <legend className="font-bold mb-2">Deelnemers en QR ophalen</legend>
        <p>{config.shop?.name || 'Selecteer een webshop'} <span className="text-sm text-slate-400">{config.shop?.domain}</span></p>
        {needsKey && <label>API-key<input className={input} type="password" autoComplete="off" placeholder="Plak je aparte Stamhoofd API-key" value={apiKey} onChange={e => setApiKey(e.target.value)} /></label>}
        <p className="text-xs text-slate-400">De key wordt alleen voor deze aanvraag gebruikt en daarna uit het veld gewist. Hij wordt niet opgeslagen.{directMode && ' De aanvraag gaat rechtstreeks naar Stamhoofd via de browser.'}</p>
        <button className={button} disabled={!config.shop || (needsKey && !apiKey.trim()) || (localMode && !isLocalApp())} onClick={() => run('Deelnemers en QR ophalen', async () => {
          setSnapshot(undefined); setShowPreview(false);
          try {
            const fetched = await loadStamhoofd(config, token, needsKey ? apiKey : undefined, setBusy);
            const preview = previewSync(fetched, config, participants);
            setSnapshot(fetched);
            setApproved(preview.rows.filter(r => (r.inactive && r.existing) || (!r.inactive && !r.errors.length && r.payment === 'Betaald')).map(r => r.itemId));
            setShowPreview(true);
          }
          finally { setApiKey(''); }
        })}>Synchroniseer deelnemers + QR</button>
        <details open={!config.shop || undefined} className="rounded-lg border border-slate-700 p-3 space-y-3">
          <summary className="cursor-pointer text-sm">Webshop en verbinding instellen</summary>
          <label>Verbinding<select className={input} value={directMode ? 'direct' : localMode ? 'local' : 'worker'} onChange={e => { update({ workerUrl: e.target.value === 'direct' ? DIRECT_STAMHOOFD : e.target.value === 'local' ? LOCAL_STAMHOOFD : '' }); setSnapshot(undefined); setShops([]); setApiKey(''); setToken(''); }}><option value="direct">Rechtstreeks via de browser</option><option value="local">Lokale koppeling</option><option value="worker">Cloudflare Worker</option></select></label>
          {localMode && !isLocalApp() && <p>Start de app via start-windows.bat of start-mac-linux.sh en open http://localhost:3000 om de lokale koppeling te gebruiken.</p>}
          {!needsKey && <>
            <label>Worker URL<input className={input} type="url" value={config.workerUrl} onChange={e => { update({ workerUrl: e.target.value }); setSnapshot(undefined); }} /></label>
            <label>Worker-toegangscode<input className={input} type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} /></label>
          </>}
          <label>Webshopdomein<input className={input} placeholder="shop.jouw-organisatie.be" value={config.domain} onChange={e => { update({ domain: e.target.value, shop: undefined }); setSnapshot(undefined); setShops([]); }} /></label>
          <button className={button} disabled={localMode && !isLocalApp()} onClick={() => run('Webshops zoeken', async () => { const result = await searchShops(config.workerUrl, config.domain, token); setShops(result.shops); setSelected(result.shops[0]?.id ?? ''); if (!result.shops.length) throw new Error('Geen webshops gevonden.'); })}>Zoek webshops</button>
          {!!shops.length && <div className="space-y-2"><label>Webshop<select className={input} value={selected} onChange={e => setSelected(e.target.value)}>{shops.map(s => <option key={s.id} value={s.id}>{s.name} ? {s.domain} ? {s.id}</option>)}</select></label><button className={button} onClick={() => run('Configuratie bewaren', async () => { const shop = shops.find(s => s.id === selected); const next = { ...config, shop, mapping: {}, productCategories: {}, lastSyncAt: undefined }; await db.stamhoofdConfigs.put(next); setConfig(next); setSnapshot(undefined); setShowPreview(false); })}>Gebruik deze webshop</button></div>}
        </details>
        {analysis && <>
          {analysis.error && <p role="alert" className="text-red-300">{analysis.error}</p>}
          <details open={!config.shop || undefined} className="rounded-lg border border-slate-700 p-3 space-y-3"><summary className="cursor-pointer font-bold">Velden aanpassen (optioneel)</summary>
          <p className="text-xs text-slate-400">Organisatie-, webshop-, order- en item-ID blijven verplicht bewaard voor veilige synchronisatie. Uitgevinkte optionele bronvelden worden bij toepassen verwijderd. Handmatig gecorrigeerde lokale gegevens blijven behouden.</p>
          <div className="grid sm:grid-cols-3 gap-2">{[['Stamhoofd order-ID'], ['Stamhoofd cart item-ID']].map(([name]) => <label key={name}><input type="checkbox" checked disabled /> {name} (verplicht)</label>)}{Object.entries(importFields).map(([key, label]) => <label key={key}><input type="checkbox" checked={key === 'product' || config.fields.includes(key)} disabled={key === 'product'} onChange={e => update({ fields: e.target.checked ? [...config.fields, key] : config.fields.filter(f => f !== key) })} /> {label}</label>)}</div>
          <div className="grid sm:grid-cols-3 gap-3">{['firstName', 'lastName', 'birthDate', 'gender'].map(key => <label key={key}>{importFields[key]} koppeling<select className={input} value={config.mapping[key] ?? ''} onChange={e => update({ mapping: { ...config.mapping, [key]: e.target.value } })}><option value="">Automatisch op veldnaam</option>{analysis.fields.map(f => <option key={f.id} value={f.id}>{f.name} ({f.id})</option>)}</select></label>)}</div>
          <details><summary>Gevonden custom fields ({analysis.fields.length})</summary><div className="grid sm:grid-cols-2 gap-2 mt-2">{analysis.fields.map(f => <label key={f.id}><input type="checkbox" checked={config.fields.includes(`custom:${f.id}`)} onChange={e => update({ fields: e.target.checked ? [...config.fields, `custom:${f.id}`] : config.fields.filter(k => k !== `custom:${f.id}`) })} /> {f.name}</label>)}</div></details>
          </details>
          <p className="text-sm">Artikelen worden bewaard: {products.map(([, name]) => name).join(', ')}. De categorie volgt uit de leeftijd op 31 december van het evenementjaar en het geslacht. Koppel bij Wedstrijdprofielen de artikelen en categorieën; ontbrekende of dubbele koppelingen kun je na import oplossen.</p>
          <button className={button} disabled={!!analysis.error} onClick={() => run('Preview voorbereiden', async () => { await db.stamhoofdConfigs.put(config); setApproved(analysis.rows.filter(r => (r.inactive && r.existing) || (!r.inactive && !r.errors.length && r.payment === 'Betaald')).map(r => r.itemId)); setShowPreview(true); })}>Configuratie bewaren en preview tonen</button>
          {showPreview && <section className="space-y-3">
            <h3 className="font-bold">Synchronisatie-preview — {analysis.rows.length} deelnemers</h3>
            <div className="flex flex-wrap gap-3 text-sm">{['nieuw', 'gewijzigd', 'ongewijzigd', 'geannuleerd'].map(status => <span key={status}>{status}: {analysis.rows.filter(r => r.change === status).length}</span>)}<span>Betaalprobleem: {analysis.rows.filter(r => r.payment !== 'Betaald').length}</span><span>Ticketsecret gevonden: {analysis.rows.filter(r => r.ticket?.secret).length}</span><span>Ticketsecret ontbreekt: {analysis.rows.filter(r => !r.ticket?.secret).length}</span></div>
            {analysis.warnings.map((warning, i) => <p className="text-amber-300 text-sm" key={i}>{warning}</p>)}
            <p className="text-sm">Selecteer zelf inschrijvingen met een betaalprobleem. Annuleringen behouden alle lokale wedstrijddata.</p>
            <div className="overflow-x-auto max-h-96"><table className="w-full text-sm text-left"><thead><tr>{['Import', 'Naam / geboortedatum', 'Artikel / indeling', 'Betaling', 'Stamhoofd ticket', 'Lokaal / wijziging'].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{analysis.rows.map(row => <tr key={row.itemId} className={`border-t border-slate-700 ${row.inactive || row.payment !== 'Betaald' || row.errors.length ? 'text-amber-300' : ''}`}><td className="p-2"><input aria-label={`Importeer ${row.registration.firstName ?? row.itemId}`} type="checkbox" disabled={(!!row.errors.length && !row.inactive) || (row.inactive && !row.existing)} checked={approved.includes(row.itemId)} onChange={e => setApproved(a => e.target.checked ? [...a, row.itemId] : a.filter(id => id !== row.itemId))} /></td><td className="p-2">{row.registration.firstName} {row.registration.lastName}<br />{row.registration.birthDate}{row.errors.map(e => <p key={e}>{e}</p>)}</td><td className="p-2">{String(row.registration.product ?? '')}<br />{(() => { const assignment = row.existing ? { ...row.existing, issues: [] } : classifyParticipant({ birthDate: row.registration.birthDate, gender: row.registration.gender, article: row.registration.product } as Participant, eventDate, categories, profiles); return <span>{categories.find(c => c.id === assignment.categoryId)?.name ?? 'Categorie te bepalen'} / {profiles.find(p => p.id === assignment.raceProfileId)?.name ?? 'Profiel te bepalen'}{assignment.issues.map(issue => <span className="block text-amber-300" key={issue}>{issue}</span>)}</span>; })()}</td><td className="p-2">{row.payment}</td><td className="p-2 break-all">{row.registration.ticketSecret as string || 'Ontbreekt / niet geselecteerd'}{row.registration.ticketUrl && <a className="block text-blue-300 underline" href={row.registration.ticketUrl as string} target="_blank" rel="noopener noreferrer">Open ticket</a>}</td><td className="p-2">{row.change}<br />{row.existing?.status ?? 'Nog niet lokaal'}{row.existing?.bibNumber ? ` / Borstnummer ${row.existing.bibNumber}` : ''}</td></tr>)}</tbody></table></div>
            <button className={button} disabled={!approved.length} onClick={() => run('Synchronisatie toepassen', async () => { const report = await applySync(snapshot, config, approved); setConfig(c => ({ ...c, lastSyncAt: new Date().toISOString() })); setShowPreview(false); setSnapshot(undefined); setMessage(`${report.applied} deelnemers lokaal opgeslagen. Verslag staat in het auditlog.`); onRefresh(); })}>Synchronisatie toepassen ({approved.length})</button>
          </section>}
        </>}
      </fieldset>
    </div>
  </div>;
}
