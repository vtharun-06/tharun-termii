import { getRole, getTimetable, writeSyncedSessions, safeEqual, sendError } from './_lib.js';
import { TIMETABLE } from './_data.js';

const IST = 'Asia/Kolkata';
const SUMMARY_RE = /^Session No:\s*(\d+)\s*-\s*([A-Z]+)\s*\(/i;
const ROOM_RE = /\(CR\s+([^)]+)\)\s*$/i;
const COURSES = new Set(TIMETABLE.courses.map((c) => c.code));

const istParts = (iso) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { d: `${p.year}-${p.month}-${p.day}`, t: `${p.hour}:${p.minute}` };
};

async function accessToken() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Calendar sync is not set up yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN in Vercel.');
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Google sign-in failed (${j.error || r.status}). The refresh token may have expired.`);
  return j.access_token;
}

async function fetchEvents(token) {
  const cal = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || 'primary');
  const events = [];
  let pageToken = '';
  do {
    const qs = new URLSearchParams({
      timeMin: `${TIMETABLE.term.start}T00:00:00+05:30`,
      timeMax: `${TIMETABLE.term.end}T23:59:59+05:30`,
      singleEvents: 'true', showDeleted: 'false', maxResults: '2500', orderBy: 'startTime',
    });
    if (pageToken) qs.set('pageToken', pageToken);
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Google Calendar read failed (${j.error?.message || r.status}).`);
    events.push(...(j.items || []));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return events;
}

export function toSessions(events) {
  const byId = new Map();
  for (const ev of events) {
    if (ev.status === 'cancelled' || !ev.start?.dateTime || !ev.end?.dateTime) continue;
    const m = SUMMARY_RE.exec(ev.summary || '');
    if (!m) continue;
    const c = m[2].toUpperCase();
    if (!COURSES.has(c)) continue;
    const n = Number(m[1]);
    const a = istParts(ev.start.dateTime), b = istParts(ev.end.dateTime);
    byId.set(`${c}-${n}`, { id: `${c}-${n}`, c, n, d: a.d, s: a.t, e: b.t, r: (ROOM_RE.exec(ev.summary)?.[1] || '').trim() });
  }
  return [...byId.values()].sort((x, y) => (x.d + x.s).localeCompare(y.d + y.s));
}

export default async function handler(req, res) {
  const cronOk = req.method === 'GET' && process.env.CRON_SECRET && safeEqual(req.headers.authorization || '', `Bearer ${process.env.CRON_SECRET}`);
  const owner = req.method === 'POST' && getRole(req) === 'owner';
  if (!cronOk && !owner) return sendError(res, req.method === 'GET' || req.method === 'POST' ? 401 : 405, 'Only the owner can refresh the timetable.');

  try {
    const sessions = toSessions(await fetchEvents(await accessToken()));
    const before = (await getTimetable()).sessions;
    if (sessions.length < before.length * 0.5) {
      return sendError(res, 422, `Calendar returned only ${sessions.length} classes (had ${before.length}). Kept the old timetable.`);
    }
    const old = new Map(before.map((s) => [s.id, `${s.d} ${s.s} ${s.e} ${s.r}`]));
    let moved = 0, added = 0;
    for (const s of sessions) {
      if (!old.has(s.id)) added++;
      else if (old.get(s.id) !== `${s.d} ${s.s} ${s.e} ${s.r}`) moved++;
    }
    const removed = before.filter((s) => !sessions.some((x) => x.id === s.id)).length;
    const doc = await writeSyncedSessions(sessions);
    return res.status(200).json({ ok: true, total: sessions.length, moved, added, removed, syncedAt: doc.syncedAt });
  } catch (e) {
    console.error(e);
    return sendError(res, 502, String(e?.message || 'Sync failed.'));
  }
}
