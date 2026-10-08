import { safeEqual, sessionCookie, sendError, sleep } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendError(res, 405, 'Use POST.');
  const { mode, secret } = req.body || {};
  const value = String(secret || '').trim();

  if (mode === 'edit') {
    if (!process.env.EDIT_PASSWORD) return sendError(res, 503, 'Edit password is not set up yet. Add EDIT_PASSWORD in Vercel project settings, then redeploy.');
    if (!value || !safeEqual(value, process.env.EDIT_PASSWORD)) { await sleep(800); return sendError(res, 401, 'That password is not right.'); }
    res.setHeader('Set-Cookie', sessionCookie('owner'));
    return res.status(200).json({ role: 'owner' });
  }

  if (mode === 'view') {
    if (!process.env.VIEW_PIN) return sendError(res, 503, 'View PIN is not set up yet. Add VIEW_PIN in Vercel project settings, then redeploy.');
    if (!value || !safeEqual(value, process.env.VIEW_PIN)) { await sleep(800); return sendError(res, 401, 'That PIN is not right.'); }
    res.setHeader('Set-Cookie', sessionCookie('viewer'));
    return res.status(200).json({ role: 'viewer' });
  }

  return sendError(res, 400, 'Choose view or edit.');
}
