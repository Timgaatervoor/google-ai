import React, { useState, useEffect } from 'react';
import { X, User, Crosshair, Flag, Clock, Edit3, ShieldAlert, CheckCircle2, UserCog } from 'lucide-react';
import type { RaceResult, AuditLog, ParticipantStatus, Participant, Category, Wave, RaceProfile } from '../types';
import { db, getActiveEventId } from '../db/dexieDb';
import { operationService, generateUUID } from '../services/operationService';
import { formatLocalTime } from '../services/timingEngine';
import { ParticipantDeletePanel } from './ParticipantDeletePanel';
import {
  getCategoryProfileIds,
  getProfilesForCategory,
} from '../services/categoryProfileService';

interface ParticipantDetailModalProps {
  isOpen?: boolean;
  onClose: () => void;
  result?: RaceResult | null;
  participant?: Participant | null;
  auditLogs?: AuditLog[];
  categories?: Category[];
  waves?: Wave[];
  profiles?: RaceProfile[];
  timingRecords?: any[];
  shootingResults?: any[];
  onUpdated: () => void;
}

export const ParticipantDetailModal: React.FC<ParticipantDetailModalProps> = ({
  isOpen,
  onClose,
  result,
  participant,
  auditLogs = [],
  categories = [],
  waves = [],
  profiles = [],
  onUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'edit'>('overview');
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(participant || null);

  // Status quick-change state
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<ParticipantStatus>('FINISHED');
  const [reason, setReason] = useState('');
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Full participant edit form state
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editBib, setEditBib] = useState('');
  const [editGender, setEditGender] = useState<'M' | 'F' | 'X'>('M');
  const [editPenaltyLaps, setEditPenaltyLaps] = useState(0);
  const [editBirthDate, setEditBirthDate] = useState('');
  const [manualCategory, setManualCategory] = useState(false);
  const [manualProfile, setManualProfile] = useState(false);
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editProfileId, setEditProfileId] = useState('');
  const [editWaveId, setEditWaveId] = useState('');
  const [editClub, setEditClub] = useState('');
  const [editTeam, setEditTeam] = useState('');
  const [editStatus, setEditStatus] = useState<ParticipantStatus>('READY');
  const [editNotes, setEditNotes] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccessMessage, setEditSuccessMessage] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const shouldShow = isOpen !== undefined ? isOpen : (result != null || participant != null);

  // Synchronize or load full participant record
  useEffect(() => {
    let cancelled = false;

    async function loadParticipant() {
      if (participant) {
        if (cancelled) return;
        setCurrentParticipant(participant);
        initForm(participant);
      } else if (result?.participantId) {
        const found = await db.participants.get(result.participantId);
        if (found && !cancelled) {
          setCurrentParticipant(found);
          initForm(found);
        }
      }
    }

    if (shouldShow) {
      loadParticipant();
    } else {
      setCurrentParticipant(null);
      setActiveTab('overview');
    }

    return () => {
      cancelled = true;
    };
  }, [participant?.id, result?.participantId, shouldShow]);

  const initForm = (p: Participant) => {
    setEditFirstName(p.firstName || '');
    setEditLastName(p.lastName || '');
    setEditBib(p.bibNumber ? String(p.bibNumber) : '');
    setEditGender(p.gender || 'X');
    setEditCategoryId(p.categoryId || '');
    setEditBirthDate(p.birthDate || '');
    setEditPenaltyLaps(p.penaltyLapsCompleted ?? 0);
    setManualCategory(p.categoryAssignment === 'manual');
    setManualProfile(p.profileAssignment === 'manual');
    setEditProfileId(p.raceProfileId || '');
    setEditWaveId(p.waveId || '');
    setEditClub(p.club || '');
    setEditTeam(p.team || '');
    setEditStatus(p.status || 'READY');
    setEditNotes(p.notes || '');
    setEditReason('');
    setEditError(null);
    setEditSuccessMessage(null);
  };

  if (!shouldShow) return null;

  const activeResult: RaceResult | null = result || (currentParticipant ? {
    participantId: currentParticipant.id,
    bibNumber: currentParticipant.bibNumber || 0,
    name: `${currentParticipant.firstName} ${currentParticipant.lastName}`.trim(),
    categoryName: categories.find((c) => c.id === currentParticipant.categoryId)?.name || 'Onbekend',
    categoryId: currentParticipant.categoryId,
    waveName: waves.find((w) => w.id === currentParticipant.waveId)?.name || 'Geen wave',
    waveId: currentParticipant.waveId,
    gender: currentParticipant.gender || 'X',
    status: currentParticipant.status,
    statusReason: currentParticipant.statusReason,
    rawElapsedFormatted: '--:--',
    shootingRounds: [],
    totalMisses: 0,
    penaltySeconds: 0,
    penaltyFormatted: '0s',
    officialTimeFormatted: '--:--',
  } : null);

  if (!activeResult) return null;

  const relevantAudits = (auditLogs || []).filter(
    (a) => a.participantId === activeResult.participantId || (activeResult.bibNumber && a.bibNumber === activeResult.bibNumber)
  );

  const handleStatusChange = async () => {
    if (!reason.trim()) {
      setStatusError('Een reden van wijziging is verplicht');
      return;
    }

    setIsSavingStatus(true);
    setStatusError(null);
    try {
      const eventId = await getActiveEventId();
      await db.participants.update(activeResult.participantId, {
        status: newStatus,
        statusReason: reason,
        updatedAt: new Date().toISOString(),
      });

      const op = {
        operationId: generateUUID(),
        eventId,
        participantId: activeResult.participantId,
        type: 'STATUS_CHANGED' as const,
        deviceId: operationService.getDeviceId(),
        operatorId: operationService.getOperator(),
        deviceTimestamp: new Date().toISOString(),
        payload: {
          bibNumber: activeResult.bibNumber,
          oldStatus: activeResult.status,
          newStatus,
          reason,
        },
        syncStatus: 'LOCAL_ONLY' as const,
        revision: 1,
      };
      await db.operations.put(op);

      await operationService.logAudit(
        'STATUS_OVERRIDE',
        `Status gewijzigd van ${activeResult.status} naar ${newStatus}. Reden: ${reason}`,
        activeResult.participantId,
        activeResult.bibNumber,
        reason
      );

      setIsEditingStatus(false);
      setReason('');
      onUpdated();
    } catch (err: any) {
      setStatusError(err?.message || 'Fout bij opslaan status.');
    } finally {
      setIsSavingStatus(false);
    }
  };

  const handleSaveParticipantEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentParticipant) return;

    if (!editFirstName.trim() || !editLastName.trim()) {
      setEditError('Voornaam en achternaam zijn verplicht.');
      return;
    }

    if (!editReason.trim()) {
      setEditError('Een toelichting / reden van wijziging is verplicht voor het auditlog.');
      return;
    }

    const selectedCategory = categories.find((category) => category.id === editCategoryId);
    const selectedProfileId = editProfileId;
    const allowedProfileIds = getCategoryProfileIds(selectedCategory);
    if (selectedProfileId && allowedProfileIds.length > 0 && !allowedProfileIds.includes(selectedProfileId)) {
      setEditError('Dit wedstrijdprofiel is niet gekoppeld aan de gekozen leeftijdscategorie.');
      return;
    }

    const parsedBib = editBib.trim() ? parseInt(editBib.trim(), 10) : undefined;
    if (editBib.trim() && (isNaN(parsedBib!) || parsedBib! <= 0)) {
      setEditError('Startnummer moet een geldig positief getal zijn.');
      return;
    }

    // Bib conflict check
    if (parsedBib && parsedBib !== currentParticipant.bibNumber) {
      const existing = await db.participants.where('bibNumber').equals(parsedBib).first();
      if (existing && existing.id !== currentParticipant.id) {
        setEditError(`Startnummer #${parsedBib} is al toegewezen aan ${existing.firstName} ${existing.lastName}. Kies een uniek nummer.`);
        return;
      }
    }

    setIsSavingEdit(true);
    setEditError(null);

    try {
      if ((await db.events.toCollection().first())?.officialResultsLocked) throw new Error('De uitslagen zijn vergrendeld.');
      if (!Number.isSafeInteger(editPenaltyLaps) || editPenaltyLaps < 0) throw new Error('Ongeldig aantal strafrondes.');
      const now = new Date().toISOString();
      const oldBib = currentParticipant.bibNumber;
      const isBibChanged = parsedBib !== oldBib;

      const newBibHistory = isBibChanged && oldBib
        ? [
            ...(currentParticipant.bibHistory || []),
            {
              oldBib,
              newBib: parsedBib || 0,
              changedAt: now,
              reason: editReason,
            },
          ]
        : currentParticipant.bibHistory;

      const updatedData: Partial<Participant> = {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        bibNumber: parsedBib,
        gender: editGender,
        birthDate: editBirthDate.trim() || undefined,
        penaltyLapsCompleted: editPenaltyLaps,
        categoryId: editCategoryId,
        raceProfileId: selectedProfileId,
        categoryAssignment: manualCategory ? 'manual' : 'automatic',
        profileAssignment: manualProfile ? 'manual' : 'automatic',
        waveId: editWaveId || undefined,
        club: editClub.trim() || undefined,
        team: editTeam.trim() || undefined,
        status: editStatus,
        statusReason: editReason,
        notes: editNotes.trim() || undefined,
        bibHistory: newBibHistory,
        updatedAt: now,
      };

      await db.participants.update(currentParticipant.id, updatedData);
      setCurrentParticipant({ ...currentParticipant, ...updatedData });

      // Cascade update bib number to related timing records and shooting results if bib changed
      if (isBibChanged && parsedBib) {
        await db.timingRecords
          .where('participantId')
          .equals(currentParticipant.id)
          .modify({ bibNumber: parsedBib });

        await db.shootingResults
          .where('participantId')
          .equals(currentParticipant.id)
          .modify({ bibNumber: parsedBib });
      }

      await db.operations.put({ operationId: generateUUID(), eventId: await getActiveEventId(), participantId: currentParticipant.id, type: 'PARTICIPANT_UPDATED', deviceId: operationService.getDeviceId(), operatorId: operationService.getOperator(), deviceTimestamp: now, payload: { updates: updatedData }, syncStatus: 'LOCAL_ONLY', revision: 1 });

      await operationService.logAudit(
        'PARTICIPANT_UPDATED',
        `Deelnemer gewijzigd: ${editFirstName} ${editLastName} (Startnummer: #${parsedBib || '-'}). Reden: ${editReason}`,
        currentParticipant.id,
        parsedBib || oldBib,
        editReason
      );

      setEditSuccessMessage('Deelnemergegevens succesvol opgeslagen en audit gelogd!');
      setTimeout(() => {
        setEditSuccessMessage(null);
        setActiveTab('overview');
      }, 1200);

      onUpdated();
    } catch (err: any) {
      setEditError(err?.message || 'Fout bij opslaan van deelnemersgegevens.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-850">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500 text-slate-950 font-black text-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              #{currentParticipant?.bibNumber || activeResult.bibNumber || '?'}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>{currentParticipant ? `${currentParticipant.firstName} ${currentParticipant.lastName}` : activeResult.name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                    (currentParticipant?.status || activeResult.status) === 'FINISHED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : (currentParticipant?.status || activeResult.status) === 'STARTED'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : ['DNS', 'DNF', 'DSQ'].includes(currentParticipant?.status || activeResult.status)
                      ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {currentParticipant?.status || activeResult.status}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {activeResult.categoryName} • {activeResult.waveName} • {activeResult.gender === 'M' ? 'Man' : activeResult.gender === 'F' ? 'Vrouw' : 'Open'}
                {currentParticipant?.club && ` • ${currentParticipant.club}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 flex gap-1">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1 rounded text-xs font-semibold transition ${
                  activeTab === 'overview'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Overzicht & Tijd
              </button>
              <button
                onClick={() => setActiveTab('edit')}
                className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
                  activeTab === 'edit'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserCog className="w-3.5 h-3.5" /> Gegevens Aanpassen
              </button>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab 1: Overview & Times */}
        {activeTab === 'overview' && (
          <div className="p-6 overflow-y-auto space-y-6 text-sm">
            {/* Timing & Penalty Breakdown */}
            {currentParticipant?.stamhoofdItemId && <div className="p-4 rounded-lg bg-slate-800 border border-slate-700 space-y-2">
              <h3 className="font-bold">Stamhoofd</h3>
              <p>Borstnummer: {currentParticipant.bibNumber ?? 'Nog niet toegewezen'}</p>
              <p>Ticketcode: {currentParticipant.stamhoofdTicketSecret || 'Niet beschikbaar'}</p>
              {currentParticipant.stamhoofdTicketUrl && /^https:\/\//.test(currentParticipant.stamhoofdTicketUrl) && <a className="text-blue-300 underline" href={currentParticipant.stamhoofdTicketUrl} target="_blank" rel="noopener noreferrer">Open ticket</a>}
              <p>Status: {currentParticipant.stamhoofdRegistration?.scannedAt ? `Gescand op ${currentParticipant.stamhoofdRegistration.scannedAt}` : 'Niet gescand / scanstatus niet opgeslagen'}</p>
              {currentParticipant.stamhoofdRegistration?.scannedBy && <p>Gescand door: {String(currentParticipant.stamhoofdRegistration.scannedBy)}</p>}
              {currentParticipant.stamhoofdInactive && <p className="text-amber-300 font-bold">Geannuleerd/inactief in Stamhoofd. Lokale wedstrijdgegevens zijn behouden.</p>}
            </div>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-800/70 border border-slate-700">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-blue-400" /> Starttijd
                </span>
                <span className="text-base font-mono font-bold text-white block mt-1">
                  {formatLocalTime(activeResult.startTime, true)}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/70 border border-slate-700">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Flag className="w-3.5 h-3.5 text-emerald-400" /> Finishtijd
                </span>
                <span className="text-base font-mono font-bold text-white block mt-1">
                  {formatLocalTime(activeResult.finishTime, true)}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/70 border border-slate-700">
                <span className="text-xs text-slate-400">Looptijd (Raw)</span>
                <span className="text-base font-mono font-bold text-white block mt-1">
                  {activeResult.rawElapsedFormatted}
                </span>
              </div>
            </div>

            {/* Official Calculation Card */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-slate-850 to-slate-800 border border-slate-700 shadow">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-slate-400 block uppercase tracking-wider font-semibold">
                    Totale Straf (Missers)
                  </span>
                  <span className="text-lg font-mono font-bold text-amber-400 mt-0.5 block">
                    {activeResult.totalMisses} missers ({activeResult.penaltyFormatted})
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block uppercase tracking-wider font-semibold">
                    Officiële Wedstrijdtijd
                  </span>
                  <span className="text-2xl font-mono font-black text-emerald-400 mt-0.5 block">
                    {activeResult.officialTimeFormatted}
                  </span>
                </div>
              </div>
              {activeResult.rankOverall && (
                <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-center gap-4 text-xs">
                  <span className="text-slate-300">
                    Algemeen Klassement: <strong className="text-white">#{activeResult.rankOverall}</strong>
                  </span>
                  {activeResult.rankCategory && (
                    <span className="text-slate-300">
                      Categorie ({activeResult.categoryName}):{' '}
                      <strong className="text-white">#{activeResult.rankCategory}</strong>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Shooting Rounds Splits */}
            <div>
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-amber-400" /> Schietbeurten
              </h4>
              {activeResult.shootingRounds.length === 0 ? (
                <p className="text-xs text-slate-500 italic p-3 bg-slate-800/40 rounded-lg">
                  Nog geen schietbeurten geregistreerd
                </p>
              ) : (
                <div className="space-y-2">
                  {activeResult.shootingRounds.map((sr, sIdx) => (
                    <div
                      key={sr.id ? `modal-sr-${sr.id}` : `modal-sr-${activeResult.participantId}-${sr.round}-${sIdx}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-800/80 border border-slate-700 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-slate-700 font-bold flex items-center justify-center text-slate-300">
                          {sr.round}
                        </span>
                        <div>
                          <span className="font-semibold text-white block">
                            Ronde {sr.round} ({sr.station})
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {formatLocalTime(sr.timestamp, true)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-emerald-400 font-bold">{sr.hits}/5 Treffers</span>
                          <span className="text-slate-500 mx-1">•</span>
                          <span className="text-red-400 font-bold">{sr.misses} Missers</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Status Override / Correction Form */}
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-blue-400" /> Snelle Status Wijziging
                </h4>
                {!isEditingStatus && (
                  <button
                    onClick={() => setIsEditingStatus(true)}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium underline"
                  >
                    Status Wijzigen
                  </button>
                )}
              </div>

              {isEditingStatus ? (
                <div className="space-y-3 mt-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Nieuwe Status:</label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value as ParticipantStatus)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="FINISHED">FINISHED (Gefinisht)</option>
                      <option value="STARTED">STARTED (Onderweg)</option>
                      <option value="READY">READY (Klaar voor start)</option>
                      <option value="DNF">DNF (Did Not Finish)</option>
                      <option value="DNS">DNS (Did Not Start)</option>
                      <option value="DSQ">DSQ (Gediskwalificeerd)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Reden van wijziging <span className="text-red-400">*</span>:
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="bv. Foutieve finish registratie gecorrigeerd"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  {statusError && <p className="text-xs text-red-400">{statusError}</p>}
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setIsEditingStatus(false);
                        setStatusError(null);
                      }}
                      className="px-3 py-1.5 rounded text-xs bg-slate-700 text-slate-300 hover:bg-slate-600"
                    >
                      Annuleren
                    </button>
                    <button
                      onClick={handleStatusChange}
                      disabled={isSavingStatus}
                      className="px-3 py-1.5 rounded text-xs bg-blue-600 text-white font-bold hover:bg-blue-500"
                    >
                      {isSavingStatus ? 'Opslaan...' : 'Wijziging Toepassen & Loggen'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Huidige status: <span className="font-semibold text-white">{activeResult.status}</span>
                  {activeResult.statusReason && <span className="text-slate-400"> ({activeResult.statusReason})</span>}
                </p>
              )}
            </div>

            {/* Audit History Log */}
            <div>
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-slate-400" /> Audit Historie
              </h4>
              {relevantAudits.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Geen specifieke audit events</p>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-1.5 font-mono text-[11px] bg-slate-950 p-3 rounded-lg border border-slate-800">
                  {relevantAudits.map((a) => (
                    <div key={`modal-audit-${a.id}`} className="text-slate-400">
                      <span className="text-slate-500">{formatLocalTime(a.timestamp, true)}</span> •{' '}
                      <span className="text-amber-400 font-semibold">{a.action}</span> •{' '}
                      <span className="text-slate-300">{a.details}</span>{' '}
                      <span className="text-slate-500">[{a.deviceId} / {a.operator}]</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Full Participant Edit Form */}
        {activeTab === 'edit' && (
          <form onSubmit={handleSaveParticipantEdit} className="p-6 overflow-y-auto space-y-4 text-xs">
            {editSuccessMessage && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>{editSuccessMessage}</span>
              </div>
            )}

            {editError && (
              <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 font-medium">
                {editError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Voornaam <span className="text-red-400">*</span>:
                </label>
                <input
                  type="text"
                  required
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Achternaam <span className="text-red-400">*</span>:
                </label>
                <input
                  type="text"
                  required
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Startnummer (Bib):
                </label>
                <input
                  type="number"
                  min="1"
                  value={editBib}
                  onChange={(e) => setEditBib(e.target.value)}
                  placeholder="bv. 42"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-amber-400 font-mono font-bold focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Geslacht:
                </label>
                <select
                  value={editGender}
                  onChange={(e) => setEditGender(e.target.value as 'M' | 'F' | 'X')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs"
                >
                  <option value="M">M (Jongens / Heren)</option>
                  <option value="F">F (Meisjes / Dames)</option>
                  <option value="X">X (Open / Gemengd)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Status:
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as ParticipantStatus)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs font-semibold"
                >
                  <option value="READY">READY (Klaar voor start)</option>
                  <option value="STARTED">STARTED (Onderweg)</option>
                  <option value="FINISHED">FINISHED (Gefinisht)</option>
                  <option value="DNS">DNS (Did Not Start)</option>
                  <option value="DNF">DNF (Did Not Finish)</option>
                  <option value="DSQ">DSQ (Gediskwalificeerd)</option>
                </select>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <label className="block">Gecontroleerde afgelegde strafrondes<input type="number" min="0" step="1" value={editPenaltyLaps} onChange={e => setEditPenaltyLaps(Number(e.target.value))} className="block w-full bg-slate-800 rounded p-2" /></label>
              <p>Artikel: {currentParticipant.article || String(currentParticipant.stamhoofdRegistration?.product ?? 'Geen')}</p>
              <label className="block">Geboortedatum (dd/mm/jjjj of jjjj-mm-dd)<input value={editBirthDate} onChange={e => setEditBirthDate(e.target.value)} className="block w-full bg-slate-800 rounded p-2" /></label>
              <label className="block"><input type="checkbox" checked={manualCategory} onChange={e => setManualCategory(e.target.checked)} /> Leeftijdscategorie handmatig vastzetten</label>
              <label className="block"><input type="checkbox" checked={manualProfile} onChange={e => setManualProfile(e.target.checked)} /> Wedstrijdprofiel handmatig vastzetten</label>
              <p>Uitgevinkt: de opgeslagen regels kunnen deze indeling aanpassen via Artikel + leeftijdscategorie toepassen.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Categorie:
                </label>
                <select
                  value={editCategoryId}
                  onChange={(e) => {
                    const nextCategoryId = e.target.value;
                    setEditCategoryId(nextCategoryId);
                    setManualCategory(true);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs"
                >
                  <option value="">Nog niet ingedeeld</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Wave / Startgroep:
                </label>
                <select
                  value={editWaveId}
                  onChange={(e) => setEditWaveId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs"
                >
                  <option value="">Geen wave toegewezen</option>
                  {waves.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} (Start: {w.scheduledStartTime})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Club / School:
                </label>
                <input
                  type="text"
                  value={editClub}
                  onChange={(e) => setEditClub(e.target.value)}
                  placeholder="Naam van je organisatie"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Wedstrijdprofiel:
                </label>
                <select
                  value={editProfileId}
                  onChange={(e) => { setEditProfileId(e.target.value); setManualProfile(true); }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs"
                >
                  <option value="">Kies een toegestaan profiel...</option>
                  {getProfilesForCategory(profiles, categories.find((category) => category.id === editCategoryId)).map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 block mt-1">
                  Dit profiel bepaalt de loop- en schietproeven voor deze deelnemer.
                </span>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Team / Ploeg:
                </label>
                <input
                  type="text"
                  value={editTeam}
                  onChange={(e) => setEditTeam(e.target.value)}
                  placeholder="bv. Team Alpha"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Notities & Opmerkingen:
              </label>
              <input
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="bv. Leenbril, polsbandje nummer 4..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-xs"
              />
            </div>

            {/* Mandatory Reason */}
            <div className="p-3.5 bg-blue-950/40 border border-blue-800/60 rounded-xl space-y-1.5">
              <label className="text-blue-300 font-bold block text-xs">
                Toelichting / Reden van wijziging <span className="text-red-400">*</span>:
              </label>
              <input
                type="text"
                required
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="bv. Startnummer omgewisseld bij aanmelding, categorie aangepast door jury"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-400 text-xs"
              />
              <span className="text-[11px] text-slate-400 block">
                Verplicht voor audit-logging volgens het biathlon wedstrijdreglement.
              </span>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  if (currentParticipant) initForm(currentParticipant);
                  setActiveTab('overview');
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition text-xs"
              >
                Annuleren
              </button>

              <button
                type="submit"
                disabled={isSavingEdit}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition text-xs shadow-lg shadow-blue-500/20"
              >
                {isSavingEdit ? 'Opslaan...' : 'Gegevens Opslaan & Loggen'}
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        <ParticipantDeletePanel key={activeResult.participantId} participantId={activeResult.participantId} name={activeResult.name} onDeleted={() => { onUpdated(); onClose(); }} />
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-850 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};

