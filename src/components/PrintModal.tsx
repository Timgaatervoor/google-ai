import { createPortal } from 'react-dom';
import { RealQrCode } from './RealQrCode';
import React, { useState } from 'react';
import { Printer, Download, X, QrCode, FileText, CheckSquare } from 'lucide-react';
import type { Participant, Wave, Category, RaceEvent, RaceProfile } from '../types';
import { downloadCsvFile } from '../services/backupService';

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: RaceEvent | null;
  participants: Participant[];
  waves: Wave[];
  categories: Category[];
  profiles: RaceProfile[];
}

export const PrintModal: React.FC<PrintModalProps> = ({
  isOpen,
  onClose,
  event,
  participants,
  waves,
  categories,
  profiles,
}) => {
  const [printMode, setPrintMode] = useState<'bibs' | 'paper_sheet' | 'waves' | 'participants'>('paper_sheet');

  const [excludedRounds, setExcludedRounds] = useState<number[]>([]);
  const roundsFor = (p: Participant) => profiles.find(profile => profile.id === p.raceProfileId)?.legs.filter(leg => leg.type === 'SHOOT') ?? [];
  const roundCount = Math.max(0, ...profiles.map(profile => profile.legs.filter(leg => leg.type === 'SHOOT').length));
  const allRounds = Array.from({ length: roundCount }, (_, i) => i + 1);
  const selectedRounds = allRounds.filter(round => !excludedRounds.includes(round));
  if (!isOpen) return null;

  const categoryMap = new Map<string, Category>(categories.map((c) => [c.id, c]));
  const waveMap = new Map<string, Wave>(waves.map((w) => [w.id, w]));

  const sortedParticipants = [...participants].sort(
    (a, b) => (a.bibNumber || 9999) - (b.bibNumber || 9999)
  );

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    let headers = '';
    let rows: string[] = [];

    if (printMode === 'paper_sheet') {
      const cell = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
      headers = ['Startnummer', 'Naam', 'Categorie', 'Startgroep', 'Geplande Start', ...selectedRounds.map(r => `Schieten ${r} (treffers/totaal)`), 'Finishtijd', 'Opmerkingen'].map(cell).join(',') + '\n';
      rows = sortedParticipants.map(p => [p.bibNumber, `${p.firstName} ${p.lastName}`, categoryMap.get(p.categoryId)?.name, waveMap.get(p.waveId)?.name, waveMap.get(p.waveId)?.scheduledStartTime,
        ...selectedRounds.map(r => { const leg = roundsFor(p)[r - 1]; return leg ? `[ / ${leg.shotCount ?? 5} ]` : '-'; }), '', ''].map(cell).join(','));
    } else {
      headers = 'Startnummer,Voornaam,Achternaam,Geslacht,Categorie,Wave,Club,Stamhoofd ID\n';
      rows = sortedParticipants.map((p) => {
        const cat = categoryMap.get(p.categoryId)?.name || '';
        const wave = p.waveId ? waveMap.get(p.waveId)?.name || '' : '';
        return `${p.bibNumber || ''},"${p.firstName}","${p.lastName}",${p.gender || ''},"${cat}","${wave}","${p.club || ''}","${p.externalId || ''}"`;
      });
    }

    const csvContent = headers + rows.join('\n');
    downloadCsvFile(csvContent, `biathlon_${printMode}_${Date.now()}.csv`);
  };

  return createPortal(
    <div className="race-print-dialog fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-3 print:p-0 print:bg-white print:static print:block">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[95vh] flex flex-col text-slate-100 overflow-hidden print:border-none print:shadow-none print:max-w-none print:max-h-none print:w-full print:bg-white print:text-black print:overflow-visible">
        {/* Screen Controls Header (hidden in print) */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-850 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Print- & Noodformulieren</h2>
              <p className="text-xs text-slate-400">
                Startnummers, startlijsten en papieren nood-registratiefiche
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            >
              <Download className="w-4 h-4" /> CSV Export
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow transition"
            >
              <Printer className="w-4 h-4" /> Afdrukken
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selection (hidden in print) */}
        <div className="px-6 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center gap-2 print:hidden overflow-x-auto text-xs">
          <button
            onClick={() => setPrintMode('paper_sheet')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              printMode === 'paper_sheet'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            📋 Papieren Noodfiche
          </button>
          <button
            onClick={() => setPrintMode('bibs')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              printMode === 'bibs'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            🏷️ Startnummers met QR
          </button>
          <button
            onClick={() => setPrintMode('waves')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              printMode === 'waves'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            🌊 Wave & Startlijst
          </button>
        </div>

        {printMode === 'paper_sheet' && <fieldset className="px-6 py-3 border-b border-slate-800 print:hidden text-xs">
          <legend className="font-bold text-white">Schietproeven op het formulier</legend>
          <div className="flex flex-wrap gap-3 mt-2">{allRounds.map(round => <label key={round} className="flex items-center gap-2"><input type="checkbox" className="accent-amber-500" checked={!excludedRounds.includes(round)} onChange={e => setExcludedRounds(current => e.target.checked ? current.filter(r => r !== round) : [...current, round])} />Schieten {round}</label>)}
          <button type="button" className="text-amber-300 underline" onClick={() => setExcludedRounds([])}>Alle selecteren</button></div>
          <p className="text-slate-400 mt-2">Het aantal schoten volgt het wedstrijdprofiel van de deelnemer. Een streepje betekent dat die schietproef niet van toepassing is.{!roundCount && ' Voeg eerst schietproeven toe bij Wedstrijdinhoud.'}</p>
        </fieldset>}
        {/* Printable Area */}
        <div className="p-6 overflow-y-auto print:overflow-visible print:p-4 text-xs font-sans">
          {/* Printable Header */}
          <div className="border-b-2 border-slate-700 pb-3 mb-4 flex items-center justify-between text-slate-800 print:text-black">
            <div>
              <h1 className="text-xl font-bold text-white print:text-black uppercase tracking-wider">
                {event?.name || 'Biathlon Tijdregistratie'}
              </h1>
              <p className="text-xs text-slate-400 print:text-slate-600">
                Locatie: {event?.location || 'Locatie nog niet ingesteld'} • Datum: {event?.date || 'Datum nog niet ingesteld'} • Document:{' '}
                {printMode.toUpperCase()}
              </p>
            </div>
            <div className="text-right text-[10px] text-slate-400 print:text-slate-600">
              <div>Aangemaakt: {new Date().toLocaleDateString('nl-BE')} {new Date().toLocaleTimeString('nl-BE')}</div>
              <div>Totaal deelnemers: {participants.length}</div>
            </div>
          </div>

          {/* Mode 1: Paper Emergency Sheet */}
          {printMode === 'paper_sheet' && (
            <div>
              <div className="mb-3 p-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 print:hidden text-xs rounded">
                💡 <strong>FAILSAFE MANUAL PAPER MODE:</strong> Gebruik deze papieren fiche indien alle digitale apparaten en accu's plotseling zouden uitvallen. Registreer finishtijd en schietresultaten met balpen.
              </div>
              <table className="w-full text-left border-collapse border border-slate-700 print:border-black text-slate-200 print:text-black text-xs">
                <thead>
                  <tr className="bg-slate-800 print:bg-slate-200 font-bold text-slate-300 print:text-black border-b border-slate-700 print:border-black">
                    <th className="p-1.5 border border-slate-700 print:border-black w-12 text-center">Bib</th>
                    <th className="p-1.5 border border-slate-700 print:border-black">Naam</th>
                    <th className="p-1.5 border border-slate-700 print:border-black">Categorie</th>
                    <th className="p-1.5 border border-slate-700 print:border-black">Startgroep</th>
                    <th className="p-1.5 border border-slate-700 print:border-black w-24">Geplande Start</th>
                    {selectedRounds.map(round => <th key={round} className="p-1.5 border border-slate-700 print:border-black text-center">Schieten {round}</th>)}
                    <th className="p-1.5 border border-slate-700 print:border-black w-28 text-center">Finishtijd</th>
                    <th className="p-1.5 border border-slate-700 print:border-black">Handtekening / Notitie</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedParticipants.map((p) => {
                    const cat = categoryMap.get(p.categoryId)?.name || '-';
                    const wave = p.waveId ? waveMap.get(p.waveId) : undefined;
                    return (
                      <tr key={p.id} className="border-b border-slate-800 print:border-slate-300 hover:bg-slate-800/30">
                        <td className="p-1.5 border border-slate-700 print:border-black font-mono font-bold text-center text-amber-400 print:text-black">
                          {p.bibNumber || '-'}
                        </td>
                        <td className="p-1.5 border border-slate-700 print:border-black font-semibold">
                          {p.firstName} {p.lastName}
                        </td>
                        <td className="p-1.5 border border-slate-700 print:border-black text-[11px]">{cat}</td>
                        <td className="p-1.5 border border-slate-700 print:border-black text-[11px]">{wave?.name || '-'}</td>
                        <td className="p-1.5 border border-slate-700 print:border-black font-mono text-[11px]">
                          {wave?.scheduledStartTime || '-'}
                        </td>
                        {selectedRounds.map(round => { const leg = roundsFor(p)[round - 1]; return <td key={round} className="p-1.5 border border-slate-700 print:border-black text-center font-mono text-slate-400 print:text-black">{leg ? `___ / ${leg.shotCount ?? 5}` : '-'}</td>; })}
                        <td className="p-1.5 border border-slate-700 print:border-black text-center font-mono text-slate-400 print:text-black">
                          ___:___:___
                        </td>
                        <td className="p-1.5 border border-slate-700 print:border-black"></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Mode 2: Bib cards with QR token */}
          {printMode === 'bibs' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2">
              {sortedParticipants.map((p) => {
                const cat = categoryMap.get(p.categoryId)?.name || '-';
                const wave = p.waveId ? waveMap.get(p.waveId)?.name || '-' : '-';
                return (
                  <div
                    key={p.id}
                    className="p-5 border-2 border-slate-700 print:border-black rounded-xl bg-slate-800/40 print:bg-white text-center flex flex-col justify-between break-inside-avoid"
                  >
                    <div className="text-[10px] font-bold text-slate-400 print:text-slate-600 uppercase tracking-widest mb-1">
                      {event?.name || 'Wedstrijd'}
                    </div>
                    <div className="text-6xl font-black font-mono tracking-tight text-white print:text-black py-2">
                      {p.bibNumber || '---'}
                    </div>
                    <div className="border-t border-slate-700 print:border-black pt-2 mt-2 flex items-center justify-between text-left">
                      <div>
                        <div className="text-base font-bold text-white print:text-black">
                          {p.firstName} {p.lastName}
                        </div>
                        <div className="text-xs text-slate-300 print:text-slate-700">
                          Cat: <span className="font-semibold">{cat}</span> • Wave: <span className="font-semibold">{wave}</span>
                        </div>
                        {p.club && (
                          <div className="text-[10px] text-slate-400 print:text-slate-600 italic">
                            Club: {p.club}
                          </div>
                        )}
                      </div>
                      <div className="w-28 h-28 bg-white p-1 rounded border border-slate-300 shrink-0 flex flex-col items-center justify-center">
                        {p.stamhoofdTicketUrl || p.stamhoofdTicketSecret || p.bibNumber ? <RealQrCode value={p.stamhoofdTicketUrl || p.stamhoofdTicketSecret || String(p.bibNumber)} size={96} /> : <span>Geen code</span>}
                        <span className="text-[8px] font-mono text-slate-900">#{(p.bibNumber || 0).toString().padStart(3, '0')}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Mode 3: Waves Overview */}
          {printMode === 'waves' && (
            <div className="space-y-6">
              {waves.map((w) => {
                const waveParticipants = participants.filter((p) => p.waveId === w.id);
                return (
                  <div key={w.id} className="border border-slate-700 print:border-black rounded-lg p-4 bg-slate-800/20 print:bg-white break-inside-avoid">
                    <div className="flex items-center justify-between border-b border-slate-700 print:border-black pb-2 mb-3">
                      <div>
                        <h3 className="text-sm font-bold text-white print:text-black">{w.name}</h3>
                        <span className="text-xs text-amber-400 print:text-black font-mono">
                          Gepland startuur: {w.scheduledStartTime}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-slate-400 print:text-black">
                        {waveParticipants.length} deelnemers
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      {waveParticipants.map((wp) => (
                        <div key={wp.id} className="p-1.5 bg-slate-800 print:bg-slate-100 rounded flex items-center justify-between">
                          <span className="font-bold text-amber-400 print:text-black">#{wp.bibNumber}</span>
                          <span className="truncate ml-1 font-medium">{wp.firstName} {wp.lastName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-850 flex justify-between items-center print:hidden">
          <span className="text-xs text-slate-400">
            {sortedParticipants.length} startnummers geconfigureerd
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>, document.body
  );
};
