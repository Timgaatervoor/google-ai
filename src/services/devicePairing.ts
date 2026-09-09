import { db } from '../db/dexieDb';
import { calculateSHA256, createFullSnapshot, restoreSnapshot, validateRecoveryFile } from './backupService';
import { syncService, type SyncConfig } from './syncService';
import type { EventSnapshot, UserRole } from '../types';
import { generateUUID } from './operationService';

interface Invite { projectUrl: string; anonKey: string; code: string }
function validateInvite(invite: Invite) {
  if (!crypto.subtle) throw new Error('Open de app via HTTPS om veilig te koppelen.');
  const url = new URL(invite.projectUrl);
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.pathname !== '/' || url.username || url.password || url.port) throw new Error('Gebruik de HTTPS-adresgegevens van je Supabase-project.');
  if (invite.anonKey?.startsWith('sb_secret_')) throw new Error('Gebruik alleen een publieke Supabase-key.');
  if (invite.anonKey?.split('.').length === 3) {
    let role: string;
    try { role = JSON.parse(atob(invite.anonKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch { throw new Error('Ongeldige publieke Supabase-key.'); }
    if (role !== 'anon') throw new Error('Gebruik alleen de anon public key voor toestelkoppeling.');
  }
  if (!/^[a-f0-9]{32}$/.test(invite.code) || !invite.anonKey || invite.anonKey.length > 2048) throw new Error('Ongeldige koppelcode.');
}
async function rpc(invite: Invite, name: string, body: unknown) {
  validateInvite(invite);
  const response = await fetch(`${invite.projectUrl.replace(/\/$/, '')}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: invite.anonKey, Authorization: `Bearer ${invite.anonKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Koppeling mislukt (HTTP ${response.status}). Controleer of de code nog geldig is en supabase/reliability.sql geïnstalleerd is.`);
  return response.status === 204 ? undefined : response.json();
}
export async function createDeviceInvite() {
  const config = syncService.getConfig();
  const event = await db.events.toCollection().first();
  if (!event || !config.enabled || config.eventId !== event.id) throw new Error('Configureer eerst synchronisatie voor het huidige evenement.');
  const code = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
  const invite = { projectUrl: config.projectUrl, anonKey: config.anonKey, code };
  const snapshot = await createFullSnapshot(event);
  // A paired PC chooses its own identity and post. Never share device PINs.
  snapshot.data.devices = [];
  snapshot.data.auditLogs = [];
  snapshot.data.syncConfig = undefined;
  snapshot.checksum = await calculateSHA256(JSON.stringify(snapshot.data));
  await rpc(invite, 'race_create_pairing', { p_code_hash: await calculateSHA256(code), p_snapshot: { data: { event: { id: event.id } }, serializedSnapshot: JSON.stringify(snapshot) } });
  const url = new URL(location.href); url.hash = `join=${btoa(JSON.stringify(invite))}`;
  return { link: url.href, code };
}
export async function readDeviceInvite(input: string): Promise<{ snapshot: EventSnapshot; config: SyncConfig }> {
  let invite: Invite;
  if (/^[a-f0-9]{32}$/i.test(input.trim())) invite = { ...syncService.getConfig(), code: input.trim().toLowerCase() };
  else {
    const fragment = input.includes('#') ? input.slice(input.indexOf('#') + 1) : input;
    try { invite = JSON.parse(atob(new URLSearchParams(fragment).get('join') ?? '')); } catch { throw new Error('Plak de volledige koppellink of scan de QR-code.'); }
  }
  validateInvite(invite);
  const envelope = await rpc(invite, 'race_consume_pairing', { p_code_hash: await calculateSHA256(invite.code) });
  // Preserve the original JSON byte ordering across PostgreSQL jsonb storage for checksum verification.
  const snapshot = JSON.parse(envelope.serializedSnapshot) as EventSnapshot;
  const validated = await validateRecoveryFile(JSON.stringify(snapshot));
  if (!validated.isValid || !validated.checksumMatch || !['participants', 'waves', 'profiles', 'categories', 'timingRecords', 'shootingResults', 'operations', 'conflicts'].every(key => Array.isArray(snapshot.data[key]))) throw new Error('Het gedeelde evenement is niet geldig. Maak een nieuwe koppeling.');
  return { snapshot, config: { enabled: true, projectUrl: invite.projectUrl, anonKey: invite.anonKey, eventId: snapshot.data.event.id } };
}
export async function joinEvent(preview: { snapshot: EventSnapshot; config: SyncConfig }, role: UserRole) {
  const oldEvent = await db.events.toCollection().first();
  if (oldEvent) await createFullSnapshot(oldEvent);
  syncService.saveConfig({ ...syncService.getConfig(), enabled: false });
  const deviceId = `${role}-${generateUUID().slice(0, 8)}`;
  const snapshot = structuredClone(preview.snapshot);
  snapshot.data.devices = [{ id: deviceId, name: deviceId, role, stationName: role, operatorName: '', isLocked: true, clockOffsetMs: 0 }];
  snapshot.data.syncConfig = { ...preview.config, enabled: false };
  await restoreSnapshot(snapshot);
  syncService.saveConfig(preview.config);
  await syncService.checkClockOffset();
}
