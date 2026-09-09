import React, { useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { syncStyles as ui } from './syncSettingsStyles';
import reliabilitySql from '../../supabase/reliability.sql?raw';
import operationsSql from '../../supabase/operations-test-setup.sql?raw';
import entitySyncSql from '../../supabase/migrations/202609080001_entity_sync.sql?raw';

export function SupabaseSetupGuide() {
  const [existing, setExisting] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const sql = `${existing ? reliabilitySql : `${operationsSql}\n\n${reliabilitySql}`}\n\n${entitySyncSql}`;
  return <div className="space-y-5 text-slate-400 leading-relaxed">
    <div>
      <h4 className="font-bold text-white">A. Maak een online werkruimte</h4>
      <p className="mt-2">Supabase bewaart de gedeelde wedstrijdregistraties op internet. Zo kunnen start, schietpost en finish gegevens uitwisselen en dezelfde tijd gebruiken. Alleen de organisator stelt dit in; medewerkers krijgen daarna een koppellink.</p>
      <ol className="list-decimal pl-5 space-y-2 mt-3">
        <li>Open Supabase via de knop hieronder en maak een account of meld je aan.</li>
        <li>Kies <strong className="text-slate-200">New project</strong> (nieuw project). Als Supabase eerst om een organisatie vraagt, maak die aan met de naam van je club.</li>
        <li>Geef het project een herkenbare naam, bijvoorbeeld ‘Tijdregistratie club’. Kies een databasewachtwoord en bewaar het. Kies een regio dicht bij het evenement en maak het project aan.</li>
        <li>Wacht tot het project klaar is. Laat dit tabblad van de app open: je komt hier terug om twee gegevens te plakken.</li>
      </ol>
      <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className={`${ui.secondary} mt-3`}><ExternalLink className="w-4 h-4" />Supabase openen</a>
      <p className="mt-2 text-slate-500">Heb je al een project voor deze app? Open dat project en ga verder met stap B.</p>
    </div>
    <div className="border-t border-slate-800 pt-4 space-y-3">
      <h4 className="font-bold text-white">B. Maak de werkruimte klaar voor de app</h4>
      <p>De onderstaande insteltekst maakt de opslag en de tijdservice klaar. Je hoeft deze code niet te begrijpen of aan te passen.</p>
      <label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" checked={existing} onChange={e => { setExisting(e.target.checked); setCopyMessage(''); }} className="w-4 h-4 mt-0.5 accent-amber-500" /><span>Dit project heeft al werkende online synchronisatie voor deze app.<span className="block text-slate-500">Aangevinkt: uitbreidingen voor gedeelde wedstrijddata, centrale tijd en koppellinks. Niet aangevinkt: inrichting van een nieuw testproject.</span></span></label>
      {!existing && <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200">Deze eerste inrichting is bedoeld om te oefenen met fictieve deelnemers. Iedereen met de publieke projectkey kan de wedstrijdgegevens lezen en wijzigen. Voor echte deelnemers moet een beheerder eerst de toegang tot jouw medewerkers beperken.</p>}
      <button type="button" className={ui.secondary} onClick={async () => { try { await navigator.clipboard.writeText(sql); setCopyMessage('Insteltekst gekopieerd. Plak deze nu in de SQL Editor van Supabase.'); } catch { setCopyMessage('Kopiëren lukt hier niet automatisch. Open de insteltekst hieronder, selecteer alles en kopieer met Ctrl+C.'); } }}><Copy className="w-4 h-4" />Insteltekst kopiëren</button>
      {copyMessage && <p role="status" className="text-slate-200">{copyMessage}</p>}
      <ol className="list-decimal pl-5 space-y-2">
        <li>Open in jouw Supabase-project links <strong className="text-slate-200">SQL Editor</strong>. Dat is het scherm waarin je de insteltekst uitvoert.</li>
        <li>Maak een nieuwe query, plak de gekopieerde tekst en klik op <strong className="text-slate-200">Run</strong> (uitvoeren).</li>
        <li>Wacht op <strong className="text-slate-200">Success</strong>. ‘No rows returned’ is normaal: je hebt de opslag klaargezet, nog geen deelnemers toegevoegd.</li>
      </ol>
      <details><summary className="cursor-pointer font-semibold text-slate-300">Insteltekst bekijken of handmatig kopiëren</summary><textarea readOnly aria-label="Insteltekst voor Supabase" value={sql} className={`${ui.input} mt-2 h-48 font-mono text-xs`} onFocus={e => e.target.select()} /></details>
      <p className="text-slate-500">Zie je een fout in plaats van Success? Bewaar die fouttekst. Wis geen tabellen om opnieuw te beginnen.</p>
    </div>
    <div className="border-t border-slate-800 pt-4 space-y-3">
      <h4 className="font-bold text-white">C. Kopieer twee gegevens naar deze app</h4>
      <ol className="list-decimal pl-5 space-y-2">
        <li>Open bovenaan je Supabase-project <strong className="text-slate-200">Connect</strong>. Zoek de <strong className="text-slate-200">Project URL</strong>: een adres zoals https://jouw-project.supabase.co. Plak dit hieronder bij ‘Projectadres’.</li>
        <li>Kopieer de <strong className="text-slate-200">Publishable key</strong> en plak die bij ‘Publieke toegangssleutel’. Je vindt de sleutels ook bij <strong className="text-slate-200">Settings → API Keys</strong>. Een oudere <strong className="text-slate-200">anon public key</strong> kan ook.</li>
        <li>Klik hieronder op <strong className="text-slate-200">Verbinding testen</strong>. Werkt de verbinding? Vink ‘Online synchronisatie inschakelen’ aan en klik op <strong className="text-slate-200">Instellingen opslaan</strong>.</li>
      </ol>
      <p>Gebruik hier niet je accountwachtwoord, databasewachtwoord of Stamhoofd-key. Een sleutel met ‘secret’ of ‘service_role’ is ook niet de juiste.</p>
      <a href="https://supabase.com/docs/guides/getting-started/api-keys" target="_blank" rel="noreferrer" className="inline-block underline text-slate-300">Hulp van Supabase bij het vinden van de juiste sleutel</a>
    </div>
  </div>;
}
