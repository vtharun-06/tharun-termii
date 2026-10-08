import { getRole, readState, writeState, sendError, getTimetable, COURSE_CODES, DEADLINE_TYPES } from './_lib.js';
import crypto from 'node:crypto';

const DUE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function cleanDeadline(d, existing) {
  if (!d || typeof d !== 'object') throw new Error('Deadline is missing.');
  const title = String(d.title || '').trim().slice(0, 200);
  if (!title) throw new Error('Add a title for the deadline.');
  if (!COURSE_CODES.has(d.course)) throw new Error('Pick a course.');
  if (!DUE_RE.test(String(d.due || ''))) throw new Error('Pick a due date and time.');
  const type = DEADLINE_TYPES.has(d.type) ? d.type : 'Other';
  return {
    id: existing?.id || crypto.randomUUID(),
    course: d.course,
    title,
    due: d.due,
    type,
    remarks: String(d.remarks || '').trim().slice(0, 1000),
    done: Boolean(d.done),
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  const role = getRole(req);
  if (!role) return sendError(res, 401, 'Sign in to continue.');

  try {
    if (req.method === 'GET') {
      const [data, timetable] = await Promise.all([readState(), getTimetable()]);
      return res.status(200).json({ role, data, timetable });
    }

    if (req.method === 'POST') {
      if (role !== 'owner') return sendError(res, 403, 'View-only access. Only Tharun can make changes.');
      const body = req.body || {};
      const state = await readState();

      switch (body.op) {
        case 'mark': {
          if (!(await getTimetable()).sessions.some((x) => x.id === body.id)) return sendError(res, 400, 'Unknown class.');
          if (body.present) state.attendance[body.id] = true;
          else delete state.attendance[body.id];
          break;
        }
        case 'saveDeadline': {
          const idx = state.deadlines.findIndex((x) => x.id === body.deadline?.id);
          const clean = cleanDeadline(body.deadline, idx > -1 ? state.deadlines[idx] : null);
          if (idx > -1) state.deadlines[idx] = clean; else state.deadlines.push(clean);
          if (state.deadlines.length > 500) return sendError(res, 400, 'Too many deadlines saved.');
          break;
        }
        case 'toggleDone': {
          const dl = state.deadlines.find((x) => x.id === body.id);
          if (!dl) return sendError(res, 404, 'That deadline no longer exists.');
          dl.done = Boolean(body.done);
          break;
        }
        case 'deleteDeadline': {
          state.deadlines = state.deadlines.filter((x) => x.id !== body.id);
          break;
        }
        default:
          return sendError(res, 400, 'Unknown change.');
      }

      const saved = await writeState(state);
      return res.status(200).json({ role, data: saved });
    }

    return sendError(res, 405, 'Method not allowed.');
  } catch (e) {
    const msg = String(e?.message || e);
    if (/token|BLOB_READ_WRITE/i.test(msg)) return sendError(res, 503, 'Storage is not connected yet.');
    if (e instanceof Error && /^(Add|Pick|Deadline)/.test(msg)) return sendError(res, 400, msg);
    console.error(e);
    return sendError(res, 500, 'Could not save. Try again.');
  }
}
