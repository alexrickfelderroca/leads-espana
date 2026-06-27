// build.js — generates the ENCRYPTED leads payload for the web app.
// Reuses the cleaning/scoring logic from the original _build_leads.js pipeline,
// then encrypts the dataset with the access password so that the file committed
// to the (public) GitHub repo is unreadable ciphertext. Only the correct password,
// entered in the browser, can decrypt it. AES-256-GCM + PBKDF2(SHA-256).
//
//   node build.js                 -> uses default password
//   LEADS_PW="mypass" node build.js  -> sets a new password
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PASSWORD = process.env.LEADS_PW || 'serres2026';
const PBKDF2_ITERS = 150000;

// Raw scrape lives in the Serres web folder; read by absolute path so this
// project folder stays self-contained and that folder is never written to.
const SRC = 'C:/Users/Rickfelder/Desktop/Serres web';
const RAW_FILES = ['leads_raw_googlemaps.json', '_lead_test_out.json', '_contact_test_out.json', '_leads_batch2.json'];

function loadArr(p) {
  try { const a = JSON.parse(fs.readFileSync(p, 'utf8')); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}

let raw = [];
for (const f of RAW_FILES) raw = raw.concat(loadArr(path.join(SRC, f)));
raw = raw.filter(p => p && !p.permanentlyClosed && !p.temporarilyClosed && !p.website);

const DAYMAP = { 'lunes':'Lun','martes':'Mar','miércoles':'Mié','miercoles':'Mié','jueves':'Jue','viernes':'Vie','sábado':'Sáb','sabado':'Sáb','domingo':'Dom',
  'monday':'Lun','tuesday':'Mar','wednesday':'Mié','thursday':'Jue','friday':'Vie','saturday':'Sáb','sunday':'Dom' };
function summarizeHours(oh) {
  if (!Array.isArray(oh) || !oh.length) return '';
  return oh.map(d => {
    const day = DAYMAP[String(d.day || '').toLowerCase()] || String(d.day || '').slice(0, 3);
    let h = String(d.hours || '').replace(/\bto\b/gi, '–').replace(/\s+/g, ' ').trim();
    if (/cerrado|closed/i.test(h)) h = 'cerrado';
    return day + ' ' + h;
  }).join(' · ');
}
function extractServices(ai) {
  if (!ai || typeof ai !== 'object') return [];
  const all = [];
  for (const cat of Object.keys(ai)) {
    const arr = ai[cat]; if (!Array.isArray(arr)) continue;
    for (const o of arr) { if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) { if (v === true) all.push(k); } } }
  }
  return all;
}

const seen = new Set();
const leads = [];
for (const p of raw) {
  const key = p.placeId || ((p.title || '') + '|' + (p.phone || p.phoneUnformatted || ''));
  if (!key || seen.has(key)) continue;
  seen.add(key);

  const phone = (p.phone || '').trim();
  const phoneRaw = (p.phoneUnformatted || p.phone || '').replace(/[^\d+]/g, '');
  const waNumber = phoneRaw.replace(/[^\d]/g, '');
  const rating = typeof p.totalScore === 'number' ? p.totalScore : null;
  const reviews = typeof p.reviewsCount === 'number' ? p.reviewsCount : 0;
  const email = Array.isArray(p.emails) && p.emails.length ? p.emails[0] : '';
  const social = (Array.isArray(p.instagrams) && p.instagrams[0]) || (Array.isArray(p.facebooks) && p.facebooks[0]) || '';
  const services = extractServices(p.additionalInfo);

  let score = Math.min(60, 20 * Math.log10(reviews + 1));
  if (rating) score += Math.max(0, (rating - 3)) * 8;
  if (phone) score += 15;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const prio = score >= 55 ? 'Alta' : score >= 35 ? 'Media' : 'Baja';
  const mapsUrl = p.url || (p.placeId ? ('https://www.google.com/maps/place/?q=place_id:' + p.placeId) : '');

  leads.push({
    id: p.placeId || (p.title + '|' + waNumber),
    name: p.title || '', sector: p.categoryName || (Array.isArray(p.categories) && p.categories[0]) || 'Otros',
    categories: Array.isArray(p.categories) ? p.categories.slice(0, 4) : [],
    city: p.city || '', neighborhood: p.neighborhood || '', state: p.state || '',
    address: p.address || '', phone, phoneRaw, wa: waNumber, email, social,
    rating, reviews, price: p.price || '', hours: summarizeHours(p.openingHours),
    services: services.slice(0, 6), score, prio, mapsUrl
  });
}
leads.sort((a, b) => b.score - a.score || b.reviews - a.reviews);

const stats = {
  total: leads.length,
  withPhone: leads.filter(l => l.phone).length,
  alta: leads.filter(l => l.prio === 'Alta').length,
  media: leads.filter(l => l.prio === 'Media').length,
  baja: leads.filter(l => l.prio === 'Baja').length,
  cities: [...new Set(leads.map(l => l.city).filter(Boolean))].length,
  sectors: [...new Set(leads.map(l => l.sector).filter(Boolean))].length,
  generated: process.env.REPORT_DATE || ''
};

const plaintext = Buffer.from(JSON.stringify({ stats, leads }), 'utf8');

// ---- Encrypt: AES-256-GCM, key = PBKDF2(password, salt) ----
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const dkey = crypto.pbkdf2Sync(PASSWORD, salt, PBKDF2_ITERS, 32, 'sha256');
const cipher = crypto.createCipheriv('aes-256-gcm', dkey, iv);
const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const tag = cipher.getAuthTag(); // WebCrypto expects tag appended to ciphertext
const payload = {
  v: 1, iters: PBKDF2_ITERS, count: leads.length,
  salt: salt.toString('base64'), iv: iv.toString('base64'),
  ct: Buffer.concat([ct, tag]).toString('base64')
};

// Committed file (safe to be public — ciphertext only)
fs.writeFileSync(path.join(__dirname, 'leads-enc.js'), 'window.LEADS_ENC=' + JSON.stringify(payload) + ';');
// Local-only plaintext for your own inspection (gitignored, never committed)
fs.writeFileSync(path.join(__dirname, 'leads.json'), JSON.stringify({ stats, leads }, null, 0));

console.log('Encrypted', leads.length, 'leads -> leads-enc.js  (password: ' + PASSWORD + ')');
console.log('Phone:', stats.withPhone, '| Alta/Media/Baja:', stats.alta + '/' + stats.media + '/' + stats.baja,
  '| Cities:', stats.cities, '| Sectors:', stats.sectors);
console.log('Ciphertext size:', (payload.ct.length / 1024).toFixed(0) + ' KB');
