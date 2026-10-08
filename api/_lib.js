import crypto from 'node:crypto';
import { put, get } from '@vercel/blob';
import { TIMETABLE } from './_data.js';

const COOKIE = 'termii_sess';
const MAX_AGE = 60 * 60 * 24 * 180; // 180 days
const STATE_PATH = 'termii/state.json';
const TIMETABLE_PATH = 'termii/timetable.json';

function secretKey() {
  return crypto.createHash('sha256')
    .update(`termii|${process.env.EDIT_PASSWORD || ''}|${process.env.VIEW_PIN || ''}`)
    .digest();
}

export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

export function sessionCookie(role) {
  const exp = Date.now() + MAX_AGE * 1000;
  const payload = `${role}.${exp}`;
  const sig = crypto.createHmac('sha256', secretKey()).update(payload).digest('base64url');
  return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function getRole(req) {
  const raw = parseCookies(req.headers.cookie)[COOKIE];
  if (!raw) return null;
  const [role, exp, sig] = raw.split('.');
  if (!role || !exp || !sig) return null;
  const expected = crypto.createHmac('sha256', secretKey()).update(`${role}.${exp}`).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  if (Date.now() > Number(exp)) return null;
  if (role === 'owner' && !process.env.EDIT_PASSWORD) return null;
  if (role === 'viewer' && !process.env.VIEW_PIN) return null;
  return role === 'owner' || role === 'viewer' ? role : null;
}

const emptyState = () => ({ attendance: {}, deadlines: [], updatedAt: null });

export async function readState() {
  try {
    const r = await get(STATE_PATH, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return emptyState();
    const text = await new Response(r.stream).text();
    const s = JSON.parse(text);
    return { ...emptyState(), ...s };
  } catch (e) {
    if (/not ?found/i.test(`${e?.name} ${e?.message}`)) return emptyState();
    throw e;
  }
}

export async function writeState(state) {
  state.updatedAt = new Date().toISOString();
  await put(STATE_PATH, JSON.stringify(state), {
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
  return state;
}

// Class schedule synced from Google Calendar; falls back to the bundled snapshot.
export async function readSyncedSessions() {
  try {
    const r = await get(TIMETABLE_PATH, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return null;
    const j = JSON.parse(await new Response(r.stream).text());
    return Array.isArray(j.sessions) && j.sessions.length ? j : null;
  } catch (e) {
    if (/not ?found/i.test(`${e?.name} ${e?.message}`)) return null;
    throw e;
  }
}

export async function writeSyncedSessions(sessions) {
  const doc = { sessions, syncedAt: new Date().toISOString() };
  await put(TIMETABLE_PATH, JSON.stringify(doc), {
    access: 'private', allowOverwrite: true, addRandomSuffix: false,
    contentType: 'application/json', cacheControlMaxAge: 60,
  });
  return doc;
}

export async function getTimetable() {
  const synced = await readSyncedSessions();
  return { ...TIMETABLE, sessions: synced ? synced.sessions : TIMETABLE.sessions, syncedAt: synced?.syncedAt || null };
}

export const COURSE_CODES = new Set([...TIMETABLE.courses.map((c) => c.code), 'GEN']);
export const DEADLINE_TYPES = new Set(['Assignment', 'Quiz', 'Project', 'Presentation', 'Other']);

export function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
