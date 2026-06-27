// build_seed.js — merges the 820 Google-Maps leads + the 99 Word-doc trade leads
// into one normalized dataset, classified by sector. Outputs:
//   leads-normalized.json  (canonical data; used by the Firestore seeder)
//   leads-mock.js          (window.LEADS_MOCK — for local UI testing only)
// Both are gitignored (the lead data never lives in the public repo).
const fs = require('fs');
const path = require('path');

const DOCX = 'C:/Users/RICKFE~1/AppData/Local/Temp/claude/C--Users-Rickfelder-Desktop-Serres-web/014e5fd1-d74c-47bb-be54-a66975cfee59/scratchpad/docx_leads.json';

// ---------- phone parsing ----------
function parsePhones(raw) {
  const out = { telefono: '', telefonoRaw: '', wa: '', telefonos: '', nota: '' };
  if (!raw) return out;
  if (/sin tel|poco legible|cortado|borroso|no visible/i.test(raw)) {
    out.nota = raw.replace(/\s+/g, ' ').trim();
    // there may still be a partial number; ignore it for calling
    return out;
  }
  const parts = raw.split('/').map(s => s.trim()).filter(Boolean);
  const valid = [];
  for (const p of parts) {
    const digits = p.replace(/[^\d]/g, '');
    if (digits.length === 9 && /^[6789]/.test(digits)) {
      valid.push({ display: p.replace(/\s+/g, ' ').trim(), digits });
    }
  }
  if (!valid.length) { out.nota = raw.replace(/\s+/g, ' ').trim(); return out; }
  out.telefono = valid[0].display;
  out.telefonoRaw = '+34' + valid[0].digits;
  out.wa = '34' + valid[0].digits;
  out.telefonos = valid.map(v => v.display).join(' · ');
  return out;
}

// ---------- name / contact split for the Word-doc entries ----------
// Many transcribed cards glue a person's name onto the business name with no space
// (e.g. "AR Pinturas y ReformasArmando", "Métrico 20 S.L.Domingo Gómez").
// Cases the lowercase→Uppercase heuristic can't resolve (acronym joins like
// "OMCOscar", brand-internal capitals like "DecoSol", space-separated joins) are
// curated explicitly. Keyed by the name AFTER email/parenthetical removal.
const OVERRIDES = {
  'Kraft ExpertGigi Ionuț Gheorghe': { n: 'Kraft Expert', c: 'Gigi Ionuț Gheorghe' },
  'PynthagorasSergio Marín': { n: 'Pynthagoras', c: 'Sergio Marín' },
  'PanelleFederico Fontanelle': { n: 'Panelle', c: 'Federico Fontanelle' },
  'DicazaMario Icaza': { n: 'Dicaza', c: 'Mario Icaza' },
  'DecoSol Daniel Jiménez': { n: 'DecoSol', c: 'Daniel Jiménez' },
  'EduisparLorenzo Paredes': { n: 'Eduispar', c: 'Lorenzo Paredes' },
  'Lampisteria OMCOscar Morillas': { n: 'Lampisteria OMC', c: 'Oscar Morillas' },
  'TecfesaVictor Montero': { n: 'Tecfesa', c: 'Victor Montero' },
  'NavaspoolsLluis Cortés / Manuel Navas': { n: 'Navaspools', c: 'Lluis Cortés / Manuel Navas' },
  'Climatización Jordi Garcia Molina': { n: 'Climatización', c: 'Jordi Garcia Molina' },
  'WilontechSebastian Wilkerson': { n: 'Wilontech', c: 'Sebastian Wilkerson' },
  'Instalaciones Porfirio Puquimia': { n: 'Instalaciones', c: 'Porfirio Puquimia' },
  'Instalaciones Integrales Ripollet Roberto / Juan': { n: 'Instalaciones Integrales Ripollet', c: 'Roberto / Juan' },
  'UriwoodOriol Jubany': { n: 'Uriwood', c: 'Oriol Jubany' },
  'RepHaro': { n: 'RepHaro', c: '' } // keep whole (brand-internal capital, no person)
};

function splitNameContact(rawName) {
  let name = rawName.trim();
  let contacto = '', email = '', nota = '';

  // pull out an email in parentheses
  const em = name.match(/\(([^)]*@[^)]*)\)/);
  if (em) { email = em[1].trim(); name = name.replace(em[0], '').trim(); }

  // pull out ALL remaining parentheticals -> nota (descriptors like "(microcementos)")
  const notas = [];
  name = name.replace(/\(([^)]+)\)/g, (_, t) => { notas.push(t.trim()); return ' '; }).replace(/\s+/g, ' ').trim();
  nota = notas.join(' · ');

  if (OVERRIDES[name]) return { name: OVERRIDES[name].n, contacto: OVERRIDES[name].c, email, nota };

  // glue split: a lowercase/digit/dot immediately followed by an Uppercase letter,
  // with the trailing segment looking like a person (≥2 letters, ≤5 tokens, allowing
  // "/"). Reject legal-form suffixes so "...S.L." / "...S.A." aren't read as a contact.
  const LEGAL = /^(s?l|s?a|s?l?u|slu|sll|scp|sccl|sc|cb|lu)$/i;
  const m = [...name.matchAll(/[\p{Ll}\d.][\p{Lu}]/gu)];
  if (m.length) {
    const last = m[m.length - 1];
    const idx = last.index + 1;
    const head = name.slice(0, idx).replace(/[.\s]+$/, '').trim();
    const tail = name.slice(idx).trim();
    const tailAlpha = tail.replace(/[^\p{L}]/gu, '');
    const headEndsLoneCap = /(^|\s)\p{Lu}$/u.test(head); // e.g. head ends in "…S" (from "S.L")
    if (/^\p{Lu}/u.test(tail) && tailAlpha.length >= 2 && !LEGAL.test(tailAlpha) && !headEndsLoneCap
        && tail.split(/[\s/]+/).length <= 5 && head.length >= 2) {
      name = head; contacto = tail;
    }
  }
  return { name: name.trim(), contacto, email, nota };
}

const SECTOR_MAP = {
  'Reformas y construcción  (12)': 'Construcción',
  'Pintors (pintores)  (21)': 'Pintura',
  'Instal·lació de plaques solars / electricistas  (12)': 'Electricidad/Solar',
  'Lampistas (fontanería / instalaciones / clima)  (32)': 'Fontanería/Climatización',
  'Fusters (carpinteros) y metalistería  (22)': 'Carpintería'
};

const leads = [];

// ---------- 820 Google Maps leads ----------
const gm = JSON.parse(fs.readFileSync(path.join(__dirname, 'leads.json'), 'utf8')).leads;
for (const l of gm) {
  leads.push({
    extId: 'gm-' + (l.id || (l.name + l.wa)),
    nombre: l.name, contacto: '', sector: l.sector || 'Otros',
    ciudad: l.city || '', provincia: l.state || '',
    telefono: l.phone || '', telefonoRaw: l.phoneRaw || '', wa: l.wa || '', telefonos: l.phone || '',
    email: l.email || '', mapsUrl: l.mapsUrl || '',
    rating: l.rating != null ? l.rating : null, reviews: l.reviews || 0,
    notasOrigen: '', origen: 'google_maps',
    estado: 'pendiente', fechaReunion: null, horaReunion: null, gestionadoPor: '', notas: ''
  });
}

// ---------- 99 Word-doc trade leads ----------
const dox = JSON.parse(fs.readFileSync(DOCX, 'utf8'));
let n = 0;
for (const it of dox) {
  n++;
  const sec = SECTOR_MAP[it.categoria] || 'Otros';
  const sn = splitNameContact(it.empresa);
  const ph = parsePhones(it.telefono);
  const notas = [sn.nota, ph.nota].filter(Boolean).join(' · ');
  leads.push({
    extId: 'tab-' + n,
    nombre: sn.name, contacto: sn.contacto, sector: sec,
    ciudad: 'Sabadell (Vallès)', provincia: 'Barcelona',
    telefono: ph.telefono, telefonoRaw: ph.telefonoRaw, wa: ph.wa, telefonos: ph.telefonos || ph.telefono,
    email: sn.email || '', mapsUrl: '',
    rating: null, reviews: 0,
    notasOrigen: notas, origen: 'tablon_sabadell',
    estado: 'pendiente', fechaReunion: null, horaReunion: null, gestionadoPor: '', notas: ''
  });
}

// ---------- preloaded sectors (always available as filters) ----------
const PRELOAD_SECTORS = ['Construcción', 'Pintura', 'Fontanería/Climatización', 'Electricidad/Solar', 'Carpintería'];

const sectorCounts = {};
leads.forEach(l => sectorCounts[l.sector] = (sectorCounts[l.sector] || 0) + 1);

fs.writeFileSync(path.join(__dirname, 'leads-normalized.json'),
  JSON.stringify({ preloadSectors: PRELOAD_SECTORS, leads }, null, 0));
fs.writeFileSync(path.join(__dirname, 'leads-mock.js'),
  'window.LEADS_MOCK=' + JSON.stringify({ preloadSectors: PRELOAD_SECTORS, leads }) + ';');

console.log('TOTAL leads:', leads.length, '(820 GM +', dox.length, 'tablón)');
console.log('Tablón sectors:', PRELOAD_SECTORS.map(s => s + ':' + (sectorCounts[s] || 0)).join('  '));
console.log('Tablón with phone:', leads.filter(l => l.origen === 'tablon_sabadell' && l.telefono).length, '/', dox.length);
console.log('Tablón with contacto:', leads.filter(l => l.origen === 'tablon_sabadell' && l.contacto).length);
console.log('Tablón no-phone:', leads.filter(l => l.origen === 'tablon_sabadell' && !l.telefono).map(l => l.nombre + ' [' + l.notasOrigen + ']').join(' | '));
