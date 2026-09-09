import React, { useState } from 'react';
import { Download, Upload, FileSpreadsheet } from 'lucide-react';
import type * as XLSX from 'xlsx';
import { currentWorkbookData, downloadEventWorkbook, readEventWorkbook, planEventWorkbook, applyEventWorkbook } from '../services/eventWorkbook';
import { createFullSnapshot, downloadJsonFile } from '../services/backupService';
import { syncStyles as ui } from './syncSettingsStyles';

export function EventWorkbookPanel({ onRefresh }: { onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{ book: XLSX.WorkBook; expected: string; plan: ReturnType<typeof planEventWorkbook> }>();
  const run = async (action: () => Promise<void>) => { setBusy(true); setMessage(''); try { await action(); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } };
  return <details className={ui.card}>
    <summary className="cursor-pointer font-bold text-white flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-amber-400" />Werken met Excel (zonder Stamhoofd)</summary>
    <p className="text-slate-400 leading-relaxed">Bereid het evenement volledig voor in Excel: artikelen, parcours met schietproeven, leeftijdscategorieën, startgroepen en deelnemers. In ‘Lees mij’ staat de invulhandleiding. De indeling volgt de leeftijd op 31 december en het artikel.</p>
    <fieldset disabled={busy} className="flex flex-wrap gap-3">
      <button type="button" className={ui.secondary} onClick={() => run(async () => downloadEventWorkbook(await currentWorkbookData(), true))}><Download className="w-4 h-4" />Blanco Excel-sjabloon</button>
      <button type="button" className={ui.secondary} onClick={() => run(async () => downloadEventWorkbook(await currentWorkbookData(), false))}><Download className="w-4 h-4" />Ingevuld Excel-werkbestand</button>
      <button type="button" className={ui.secondary} onClick={() => run(async () => { const data = await currentWorkbookData(); downloadJsonFile(await createFullSnapshot(data.event), `biathlon-volledige-backup-${Date.now()}.json`); })}><Download className="w-4 h-4" />Volledige herstelback-up</button>
      <label className={`${ui.primary} cursor-pointer`}><Upload className="w-4 h-4" />Excel-werkbestand inlezen<input aria-label="Excel-werkbestand inlezen" type="file" accept=".xlsx" className="sr-only" onChange={e => {
        const file = e.target.files?.[0]; e.target.value = ''; setPreview(undefined);
        if (file) void run(async () => { const book = readEventWorkbook(await file.arrayBuffer()); const data = await currentWorkbookData(); setPreview({ book, expected: JSON.stringify(data), plan: planEventWorkbook(book, data) }); });
      }} /></label>
    </fieldset>
    <p className="text-slate-400">De ingevulde Excel bevat alle deelnemers, ook buiten je lijstfilter. Gebruik JSON voor volledig herstel inclusief tijden, schietresultaten en logs. Herimport van Excel is alleen mogelijk vóór de wedstrijd; verwijderde rijen wissen niets in de app.</p>
    {preview && <div className="space-y-3 border-t border-slate-800 pt-4">
      <h4 className="font-bold text-white">Controle vóór import: {preview.plan.data.event.name}</h4>
      <p>{preview.plan.imported} deelnemersrijen te verwerken. Na import: {preview.plan.data.participants.length} deelnemers, {preview.plan.data.profiles.length} profielen, {preview.plan.data.categories.length} categorieën en {preview.plan.data.waves.length} startgroepen.</p>
      <p className="text-amber-300">De evenementinstellingen en bestaande rijen met dezelfde code worden bijgewerkt. Eerst wordt een lokale herstelback-up bewaard. Koppel andere pc’s pas na deze voorbereiding.</p>
      {preview.plan.errors.length > 0 && <div className="max-h-48 overflow-auto text-red-400" role="alert"><p className="font-bold">Los deze fouten op in Excel en lees opnieuw in:</p><ul className="list-disc pl-5">{preview.plan.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
      {preview.plan.warnings.length > 0 && <div className="max-h-48 overflow-auto text-amber-300"><p>Deze deelnemers vereisen nog indeling in de app:</p><ul className="list-disc pl-5">{preview.plan.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
      <div className="flex gap-3"><button type="button" className={ui.primary} disabled={busy || !!preview.plan.errors.length} onClick={() => run(async () => { const result = await applyEventWorkbook(preview.book, preview.expected); setPreview(undefined); setMessage(`${result.imported} deelnemersrijen verwerkt. De voorbereiding is bijgewerkt.`); onRefresh(); })}>Voorbereiding importeren</button><button type="button" className={ui.secondary} disabled={busy} onClick={() => setPreview(undefined)}>Annuleren</button></div>
    </div>}
    {busy && <p role="status">Bestand verwerken...</p>}
    {message && <p role="status" className="text-amber-300 whitespace-pre-wrap">{message}</p>}
  </details>;
}
