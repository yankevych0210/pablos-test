// api/send.js — Vercel Serverless Function
// Drop-in replacement for send.php, proxies to Dr Tracker API

const API_URL      = 'https://tracker.doctor-mailer.com/repost.php?act=register';
const API_KEY      = 'TVRjNU56aGZOelkyWHpFM09UYzRYdz09';
const API_PASSWORD = 'DVc4pw2xlm';
const CAMPAIGN_ID  = '22909';

// ── helpers ──────────────────────────────────────────────────────────────────

function sanitizeName(v) {
  return (v || '').trim().replace(/[<>"']/g, '');
}

function sanitizeEmail(v) {
  return (v || '').trim().toLowerCase();
}

function sanitizePhone(v) {
  // keep digits, +, spaces, hyphens, parens
  return (v || '').trim().replace(/[^\d+\s\-()]/g, '');
}

function validateEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function validatePhone(v) {
  const digits = v.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

// Parse multipart/form-data or application/x-www-form-urlencoded from raw body
async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();

  const ct = req.headers['content-type'] || '';

  if (ct.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }

  if (ct.includes('multipart/form-data')) {
    const boundary = ct.split('boundary=')[1];
    if (!boundary) return {};
    const fields = {};
    const parts = raw.split('--' + boundary);
    for (const part of parts) {
      const match = part.match(/Content-Disposition: form-data; name="([^"]+)"\r?\n\r?\n([\s\S]*?)\r?\n?$/);
      if (match) fields[match[1]] = match[2].replace(/\r?\n$/, '');
    }
    return fields;
  }

  // fallback: try JSON
  try { return JSON.parse(raw); } catch { return {}; }
}

// ── handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS headers (useful during local dev)
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  let fields;
  try {
    fields = await parseBody(req);
  } catch {
    return res.status(400).json({ success: false, message: 'Bad request' });
  }

  // ── Honeypot ────────────────────────────────────────────────────────────────
  if (fields.website && fields.website.trim() !== '') {
    // silently pretend success for bots
    return res.status(200).json({ success: true, message: 'OK' });
  }

  // ── Sanitize ────────────────────────────────────────────────────────────────
  const firstName = sanitizeName(fields.fname);
  const lastName  = sanitizeName(fields.lname);
  const email     = sanitizeEmail(fields.email);
  const phone     = sanitizePhone(fields.phone);

  // ── Server-side validation ──────────────────────────────────────────────────
  const errors = [];
  if (!firstName || firstName.length < 2) errors.push('Invalid first name');
  if (!lastName  || lastName.length  < 2) errors.push('Invalid last name');
  if (!email     || !validateEmail(email)) errors.push('Invalid email');
  if (!phone     || !validatePhone(phone)) errors.push('Invalid phone');

  if (errors.length) {
    return res.status(400).json({ success: false, message: errors.join('; ') });
  }

  // ── Build POST body for Dr Tracker ─────────────────────────────────────────
  const ip      = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '0.0.0.0';
  const referer = req.headers['referer'] || '';

  const params = new URLSearchParams({
    ApiKey      : API_KEY,
    ApiPassword : API_PASSWORD,
    CampaignID  : CAMPAIGN_ID,
    FirstName   : firstName,
    LastName    : lastName,
    Email       : email,
    PhoneNumber : phone,
    Language    : 'es',
    IP          : ip,
    Page        : referer,
    Description : 'Lead from landing page',
    Note        : '',
    SubSource   : 'landing_form',
  });

  // ── Call Dr Tracker API ────────────────────────────────────────────────────
  let apiRes;
  try {
    apiRes = await fetch(API_URL, {
      method  : 'POST',
      headers : {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept'      : 'application/json',
      },
      body    : params.toString(),
      signal  : AbortSignal.timeout(30_000),
    });
  } catch (err) {
    console.error('Dr Tracker fetch error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Error de conexión. Inténtalo más tarde.',
    });
  }

  let result;
  const rawText = await apiRes.text();
  try {
    result = JSON.parse(rawText);
  } catch {
    // API returned HTML or garbage
    console.error('Dr Tracker non-JSON response:', rawText.slice(0, 200));
    return res.status(502).json({
      success: false,
      message: 'Error inesperado. Inténtalo más tarde.',
    });
  }

  if (!result || result.ret_code === undefined) {
    console.error('Dr Tracker bad response:', rawText.slice(0, 500));
    return res.status(502).json({
      success: false,
      message: 'Error inesperado. Inténtalo más tarde.',
    });
  }

  const code = Number(result.ret_code);

  // ── Success ────────────────────────────────────────────────────────────────
  if (code === 200 || code === 201) {
    const out = { success: true, message: 'OK' };
    if (result.url) out.redirect_url = result.url;
    return res.status(200).json(out);
  }

  // ── Duplicate email ────────────────────────────────────────────────────────
  if (code === 409) {
    return res.status(200).json({
      success: false,
      message: 'Este correo electrónico ya está registrado.',
    });
  }

  // ── Other API errors ───────────────────────────────────────────────────────
  const apiMsg = result.ret_message || '';
  let msg = 'Error al procesar la solicitud. Inténtalo de nuevo.';
  if (/Invalid Phone/i.test(apiMsg))   msg = 'El número de teléfono no es válido.';
  if (/Invalid Email/i.test(apiMsg))   msg = 'El correo electrónico no es válido.';
  if (/No brand found/i.test(apiMsg))  msg = 'Problema temporal. Inténtalo más tarde.';

  console.error('Dr Tracker error:', apiMsg);
  return res.status(200).json({ success: false, message: msg });
}
