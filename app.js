// app.js — 1000 Ventas Command Center
// Real-time team CRM. Data layer abstracts Firebase (live, multi-device) and a local
// demo mode (for previewing without a backend). All rendering flows from DB.subscribe,
// so a change on any device updates every screen.

const CFG = window.APP_CONFIG || {};
const MOCK_MODE = !CFG.firebase;

/* ---------------- motivational messages ---------------- */
const MOTIV = [
  "Cada «no» te acerca al «sí».",
  "El próximo lead puede ser la <b>venta del mes</b>.",
  "Coge el teléfono. <b>Vas a por todas.</b>",
  "Los cierres se hacen <b>llamada a llamada</b>.",
  "Hoy el objetivo es el <b>100%</b>.",
  "Quien más marca, <b>más cierra</b>.",
  "El «sí» está a una llamada de distancia.",
  "Sonríe antes de marcar. <b>Se nota en la voz.</b>",
  "Hoy alguien va a decir que sí. Que seas tú quien llame.",
  "La constancia gana a la suerte.",
  "No vendes productos, <b>abres oportunidades</b>.",
  "Un embudo lleno es un <b>mes tranquilo</b>.",
  "Tu próxima reunión empieza con un clic.",
  "El mejor momento para llamar es <b>ahora</b>.",
  "Pierde el miedo, <b>gana la comisión</b>.",
  "Los números no mienten: marca más, cierra más.",
  "Levanta el teléfono como quien levanta un trofeo.",
  "Hazlo por el cierre. <b>Hazlo por el equipo.</b>"
];

const WA_TEMPLATE = "Hola{contacto} 👋, te escribo porque trabajo creando páginas web para empresas del sector y me ha gustado mucho {nombre}. ¿Te puedo enseñar una propuesta sin compromiso?";

const PRELOAD_SECTORS = ["Construcción","Pintura","Fontanería/Climatización","Electricidad/Solar","Carpintería"];
const LEVEL = { pendiente:0, llamado:1, reunion:2, vendido:3 };
const ESTADO_LABEL = { pendiente:"Por llamar", llamado:"Llamado", reunion:"Reunión", vendido:"Vendido" };

/* ===================================================================
   DATA LAYER
   =================================================================== */
let DB;

function makeMockDB() {
  let leads = [];
  let cb = null;
  const TRACK_KEY = "cc_mock_tracking_v1";
  function loadTracking(){ try { return JSON.parse(localStorage.getItem(TRACK_KEY)) || {}; } catch(e){ return {}; } }
  function saveTracking(t){ try { localStorage.setItem(TRACK_KEY, JSON.stringify(t)); } catch(e){} }
  return {
    mode: "mock",
    async ready() {
      const data = await loadMock();
      const track = loadTracking();
      leads = data.leads.map(l => Object.assign({}, l, track[l.extId] || {}));
    },
    async signIn(password) {
      return password === (CFG.mockPassword || "1000ventas")
        ? { ok:true } : { ok:false, error:"Contraseña incorrecta" };
    },
    subscribe(fn){ cb = fn; fn(leads.slice(), null); },
    async update(extId, patch) {
      const t = loadTracking();
      t[extId] = Object.assign({}, t[extId], patch);
      saveTracking(t);
      const i = leads.findIndex(l => l.extId === extId);
      if (i >= 0) leads[i] = Object.assign({}, leads[i], patch);
      if (cb) cb(leads.slice(), [extId]);
    },
    async add(lead) {
      leads.unshift(lead);
      const t = loadTracking(); t[lead.extId] = lead; saveTracking(t);
      if (cb) cb(leads.slice(), [lead.extId]);
    }
  };
}

function makeFirebaseDB() {
  let leads = [], cb = null, app, auth, db, fns = {}, prevSnap = {};
  return {
    mode: "firebase",
    async ready() {
      const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
      const authMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
      const fsMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      app = appMod.initializeApp(CFG.firebase);
      auth = authMod.getAuth(app);
      db = fsMod.getFirestore(app);
      fns = { ...authMod, ...fsMod };
      // resolve once we know auth state (persisted sessions stay logged in)
      await new Promise(res => { const u = authMod.onAuthStateChanged(auth, () => { u(); res(); }); });
    },
    isAuthed(){ return !!auth.currentUser; },
    async signIn(password) {
      try {
        await fns.signInWithEmailAndPassword(auth, CFG.sharedEmail, password);
        return { ok:true };
      } catch(e) {
        const code = (e && e.code) || "";
        if (/wrong-password|invalid-credential|invalid-login/.test(code)) return { ok:false, error:"Contraseña incorrecta" };
        if (/too-many-requests/.test(code)) return { ok:false, error:"Demasiados intentos, espera un momento" };
        if (/network/.test(code)) return { ok:false, error:"Sin conexión" };
        return { ok:false, error:"No se pudo entrar ("+code+")" };
      }
    },
    subscribe(fn) {
      cb = fn;
      const col = fns.collection(db, "leads");
      fns.onSnapshot(col, snap => {
        leads = [];
        const changed = [];
        snap.forEach(d => { const data = d.data(); data.extId = d.id; leads.push(data); });
        snap.docChanges().forEach(ch => { if (ch.type !== "removed") changed.push(ch.doc.id); });
        cb(leads.slice(), changed);
      }, err => { console.error("onSnapshot", err); cb(leads.slice(), null, err); });
    },
    async update(extId, patch) {
      const ref = fns.doc(db, "leads", extId);
      await fns.updateDoc(ref, Object.assign({}, patch, { actualizadoEn: fns.serverTimestamp() }));
    },
    async add(lead) {
      const ref = fns.doc(db, "leads", lead.extId);
      await fns.setDoc(ref, Object.assign({}, lead, { creadoEn: fns.serverTimestamp(), actualizadoEn: fns.serverTimestamp() }));
    }
  };
}

// load demo data (only in mock mode) by injecting leads-mock.js
function loadMock() {
  return new Promise((resolve, reject) => {
    if (window.LEADS_MOCK) return resolve(window.LEADS_MOCK);
    const s = document.createElement("script");
    s.src = "leads-mock.js";
    s.onload = () => resolve(window.LEADS_MOCK || { leads:[], preloadSectors:PRELOAD_SECTORS });
    s.onerror = () => resolve({ leads:[], preloadSectors:PRELOAD_SECTORS });
    document.head.appendChild(s);
  });
}

/* ===================================================================
   LOADER (rotating messages)
   =================================================================== */
let motivTimer;
function startLoader() {
  const el = document.getElementById("motiv");
  let i = 0;
  el.innerHTML = MOTIV[0];
  motivTimer = setInterval(() => {
    el.classList.add("out");
    setTimeout(() => { i = (i + 1) % MOTIV.length; el.innerHTML = MOTIV[i]; el.classList.remove("out"); }, 400);
  }, 2600);
}
function stopLoader() {
  clearInterval(motivTimer);
  const l = document.getElementById("loader");
  l.style.transition = "opacity .4s"; l.style.opacity = "0";
  setTimeout(() => l.style.display = "none", 400);
}

/* ===================================================================
   AUTH FLOW
   =================================================================== */
const $ = id => document.getElementById(id);
function caller(){ try { return localStorage.getItem("cc_caller") || ""; } catch(e){ return ""; } }
function setCaller(n){ try { localStorage.setItem("cc_caller", n); } catch(e){} }
function knownCallers(){ try { return JSON.parse(localStorage.getItem("cc_known")) || []; } catch(e){ return []; } }
function rememberCaller(n){ const k = knownCallers(); if (n && !k.includes(n)) { k.push(n); try { localStorage.setItem("cc_known", JSON.stringify(k)); } catch(e){} } }

function showLogin(){ $("login").classList.add("show"); setTimeout(() => $("pw").focus(), 200); }

async function doLogin() {
  const btn = $("pwBtn"), err = $("loginErr");
  btn.disabled = true; err.textContent = "";
  const res = await DB.signIn($("pw").value);
  btn.disabled = false;
  if (!res.ok) { err.textContent = res.error || "Error"; $("pw").value = ""; $("pw").focus(); return; }
  goWhoStep();
}
function goWhoStep() {
  if (caller()) return enterApp();
  $("pwStep").style.display = "none";
  $("whoStep").style.display = "block";
  const chips = $("whoChips"), known = knownCallers();
  if (known.length) {
    chips.classList.add("show");
    chips.innerHTML = known.map(n => `<button class="who-chip" data-name="${escAttr(n)}">${esc(n)}</button>`).join("");
  }
  setTimeout(() => $("whoInput").focus(), 150);
}
function commitWho(name) {
  name = (name || "").trim();
  if (!name) { $("whoInput").focus(); return; }
  setCaller(name); rememberCaller(name); enterApp();
}
function enterApp() {
  $("login").classList.remove("show");
  $("app").style.display = "block";
  updateCallerChip();
  bootData();
}
function updateCallerChip() {
  const n = caller() || "—";
  $("callerName").textContent = n;
  $("callerAv").textContent = (n[0] || "?").toUpperCase();
}

/* ===================================================================
   STATE + RENDER
   =================================================================== */
let LEADS = [], byId = {}, firstRender = true, pendingLocal = new Set(), notesOpen = new Set();
let Q = "", F = { sector:"", estado:"", city:"", sort:"estado" };
let filtered = [], rendered = 0; const CHUNK = 36;

function bootData() {
  DB.subscribe((leads, changed, err) => {
    if (err) { setLive(false); return; }
    setLive(true);
    LEADS = leads; byId = {}; leads.forEach(l => byId[l.extId] = l);
    updateDashboard();
    buildFacets();
    if (firstRender) { firstRender = false; applyFilters(); }
    else if (changed && changed.length) {
      changed.forEach(id => {
        const remote = !pendingLocal.has(id);
        pendingLocal.delete(id);
        patchCard(id, remote);
      });
    } else { applyFilters(); }
  });
  bindUI();
}

function setLive(on) {
  const b = $("liveBadge"), t = $("liveTxt");
  if (MOCK_MODE) { b.classList.remove("off"); t.textContent = "Demo local"; b.title = "Modo demo (sin backend)"; return; }
  b.classList.toggle("off", !on);
  t.textContent = on ? "En vivo" : "Reconectando…";
}

/* ---------- dashboard ---------- */
function computeStats() {
  let llamados=0, reuniones=0, ventas=0;
  const sec = {};
  for (const l of LEADS) {
    const lv = LEVEL[l.estado] || 0;
    if (lv >= 1) llamados++;
    if (lv >= 2) reuniones++;
    if (lv >= 3) ventas++;
    const s = l.sector || "Otros";
    if (!sec[s]) sec[s] = { llamadas:0, reuniones:0, ventas:0, total:0 };
    sec[s].total++;
    if (lv >= 1) sec[s].llamadas++;
    if (lv >= 2) sec[s].reuniones++;
    if (lv >= 3) sec[s].ventas++;
  }
  return { total: LEADS.length, llamados, reuniones, ventas, sec };
}
let prevStats = { total:0, llamados:0, reuniones:0, ventas:0 };
function updateDashboard() {
  const s = computeStats();
  const pct = s.total ? Math.round(s.llamados / s.total * 100) : 0;
  $("pBar").style.width = pct + "%";
  tween($("pNum"), prevStats.pctRaw || 0, pct, "");
  prevStats.pctRaw = pct;
  $("pTotal").textContent = s.total;
  tween($("pLlamados"), prevStats.llamados, s.llamados, "");
  tween($("cLlamados"), prevStats.llamados, s.llamados, "");
  $("cLlamadosX").textContent = "de " + s.total;
  tween($("cReuniones"), prevStats.reuniones, s.reuniones, "");
  $("cReunionesX").textContent = "conv. " + (s.llamados ? Math.round(s.reuniones/s.llamados*100) : 0) + "%";
  tween($("cVentas"), prevStats.ventas, s.ventas, "");
  $("cVentasX").textContent = "conv. " + (s.reuniones ? Math.round(s.ventas/s.reuniones*100) : 0) + "%";
  $("cConv").textContent = (s.llamados ? Math.round(s.ventas/s.llamados*100) : 0) + "%";
  prevStats.llamados = s.llamados; prevStats.reuniones = s.reuniones; prevStats.ventas = s.ventas; prevStats.total = s.total;
  renderRanks(s.sec);
}
function renderRanks(sec) {
  const entries = Object.entries(sec);
  // más dicen sí = mayor % conversión (reuniones+ventas)/llamadas, con ≥3 llamadas
  const si = entries.filter(([,v]) => v.llamadas >= 3)
    .map(([k,v]) => [k, (v.reuniones + v.ventas) / v.llamadas, v.reuniones + v.ventas, v.llamadas])
    .sort((a,b) => b[1]-a[1]).slice(0,5);
  const calls = entries.map(([k,v]) => [k, v.llamadas]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const sales = entries.map(([k,v]) => [k, v.ventas]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,5);
  fillRank("rankSi", si.map(r => [r[0], Math.round(r[1]*100) + "%", r[1]]), 1, "Aún sin llamadas suficientes");
  const maxC = Math.max(1, ...calls.map(r=>r[1]));
  fillRank("rankCalls", calls.map(r => [r[0], r[1], r[1]/maxC]), 1, "Aún sin llamadas");
  const maxS = Math.max(1, ...sales.map(r=>r[1]));
  fillRank("rankSales", sales.map(r => [r[0], r[1], r[1]/maxS]), 1, "Aún sin ventas — ¡a por ellas!");
}
function fillRank(id, rows, _u, emptyMsg) {
  const el = $(id);
  if (!rows.length) { el.innerHTML = `<div class="empty">${emptyMsg}</div>`; return; }
  el.innerHTML = rows.map(([name, val, frac]) =>
    `<div class="rrow"><div class="rn">${esc(name)}</div><div class="rv mono">${val}</div>`+
    `<div class="rbar"><i style="width:${Math.round(Math.max(.04,frac)*100)}%"></i></div></div>`).join("");
}

/* ---------- facets ---------- */
function buildFacets() {
  const secCount = {}, cityCount = {};
  LEADS.forEach(l => { const s=l.sector||"Otros"; secCount[s]=(secCount[s]||0)+1; if(l.ciudad){cityCount[l.ciudad]=(cityCount[l.ciudad]||0)+1;} });
  // sector chips: preload first, then others by count
  const others = Object.keys(secCount).filter(s => !PRELOAD_SECTORS.includes(s)).sort((a,b)=>secCount[b]-secCount[a]);
  const order = [...PRELOAD_SECTORS, ...others];
  const chips = $("sectorChips");
  chips.innerHTML = `<button class="chip${F.sector===""?" on":""}" data-sector="">Todos <span class="n">${LEADS.length}</span></button>` +
    order.map(s => `<button class="chip${F.sector===s?" on":""}" data-sector="${escAttr(s)}">${esc(s)} <span class="n">${secCount[s]||0}</span></button>`).join("");
  // city select
  const csel = $("fCity");
  if (csel.dataset.built !== "1" || csel.options.length < 2) {
    const cities = Object.keys(cityCount).sort((a,b)=>cityCount[b]-cityCount[a]);
    csel.innerHTML = `<option value="">Todas las ciudades</option>` + cities.map(c=>`<option value="${escAttr(c)}">${esc(c)} (${cityCount[c]})</option>`).join("");
    csel.dataset.built = "1";
  }
  // add-lead sector options
  const asel = $("aSector");
  if (asel && asel.options.length === 0) asel.innerHTML = order.map(s=>`<option value="${escAttr(s)}">${esc(s)}</option>`).join("");
}

/* ---------- filters + list ---------- */
function applyFilters() {
  const q = Q.trim().toLowerCase();
  filtered = LEADS.filter(l => {
    if (F.sector && l.sector !== F.sector) return false;
    if (F.city && l.ciudad !== F.city) return false;
    if (F.estado && l.estado !== F.estado) return false;
    if (q) {
      const hay = (l.nombre+" "+(l.contacto||"")+" "+(l.ciudad||"")+" "+(l.sector||"")+" "+(l.telefono||"")+" "+(l.telefonos||"")).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  const s = F.sort;
  filtered.sort((a,b) => {
    if (s==="nombre") return a.nombre.localeCompare(b.nombre);
    if (s==="reviews") return (b.reviews||0)-(a.reviews||0);
    if (s==="rating") return (b.rating||0)-(a.rating||0) || (b.reviews||0)-(a.reviews||0);
    // por fase: vendidos→reunión→llamado→pendiente, luego por reseñas
    return (LEVEL[b.estado]||0)-(LEVEL[a.estado]||0) || (b.reviews||0)-(a.reviews||0);
  });
  $("rCount").textContent = filtered.length;
  const grid = $("grid"); grid.innerHTML = ""; rendered = 0;
  if (!filtered.length) { grid.innerHTML = `<div class="empty-grid"><div class="eg">Sin resultados</div>Prueba con otros filtros.</div>`; return; }
  renderMore();
}
function renderMore() {
  const grid = $("grid");
  const frag = document.createDocumentFragment();
  filtered.slice(rendered, rendered + CHUNK).forEach(l => frag.appendChild(cardEl(l)));
  grid.appendChild(frag);
  rendered += Math.min(CHUNK, filtered.length - rendered);
}
function patchCard(extId, remote) {
  const lead = byId[extId]; if (!lead) return;
  const old = document.querySelector(`.lead[data-id="${cssEsc(extId)}"]`);
  if (old) {
    const fresh = cardEl(lead);
    if (remote) fresh.classList.add("flash");
    old.replaceWith(fresh);
    if (notesOpen.has(extId)) { fresh.querySelector(".notewrap").classList.add("show"); fresh.querySelector(".notebtn").classList.add("has"); }
  } else if (passesFilter(lead)) {
    // newly added & matches filter → put on top
    const grid = $("grid"); grid.insertBefore(cardEl(lead), grid.firstChild); rendered++;
    $("rCount").textContent = (parseInt($("rCount").textContent,10)||0) + 1;
  }
}
function passesFilter(l) {
  if (F.sector && l.sector !== F.sector) return false;
  if (F.city && l.ciudad !== F.city) return false;
  if (F.estado && l.estado !== F.estado) return false;
  return true;
}

/* ---------- card ---------- */
function cardEl(l) {
  const lv = LEVEL[l.estado] || 0;
  const el = document.createElement("div");
  el.className = "lead e-" + l.estado;
  el.dataset.id = l.extId;

  const meta = [];
  if (l.ciudad) meta.push(`<span class="mi">📍 <b>${esc(l.ciudad)}</b></span>`);
  if (l.contacto) meta.push(`<span class="mi">👤 ${esc(l.contacto)}</span>`);
  if (l.rating != null) meta.push(`<span class="mi"><span class="star">★</span> ${l.rating} <span style="color:var(--faint)">(${l.reviews||0})</span></span>`);
  if (l.telefono) meta.push(`<span class="mi mono">${esc(l.telefono)}</span>`);

  const phoneOk = !!l.telefonoRaw, waOk = !!l.wa;
  const waMsg = encodeURIComponent(WA_TEMPLATE.replace("{contacto}", l.contacto ? " "+l.contacto.split(/\s+/)[0] : "").replace("{nombre}", l.nombre));

  // funnel steps
  const steps = [["s1","Llamado",1],["s2","Reunión",2],["s3","Venta",3]].map(([cls,label,si]) => {
    let st = "step "+cls;
    if (lv >= si) st += " done";
    else if (lv === si-1) st += " next";
    else st += " locked";
    const mark = lv >= si ? "✓" : si;
    return `<div class="${st}" data-step="${si}"><div class="sk">${mark}</div><div class="sl">${label}</div></div>`;
  }).join("");

  const meetHtml = (lv >= 2 && l.fechaReunion)
    ? `<div class="meet"><span class="mlab">Reunión</span><span class="mval">${fmtDate(l.fechaReunion)}${l.horaReunion?" · "+l.horaReunion:""}</span><button data-editmeet>editar</button></div>` : "";

  const by = l.gestionadoPor ? `<span class="byline">Gestionado por <b>${esc(l.gestionadoPor)}</b></span>` : `<span class="byline">Sin asignar</span>`;

  el.innerHTML =
    `<div class="lhead"><div class="top"><div class="lname">${esc(l.nombre)}</div>`+
      `<span class="lsector">${esc(l.sector||"Otros")}</span></div>`+
      `<div class="lmeta">${meta.join("")}</div>`+
      (l.notasOrigen ? `<div class="lnota">${esc(l.notasOrigen)}</div>` : "")+
    `</div>`+
    `<div class="lbody">`+
      `<div class="lacts">`+
        (phoneOk ? `<a class="la call" href="tel:${escAttr(l.telefonoRaw)}">${ic("phone")}Llamar</a>` : `<span class="la dis">${ic("phone")}Sin tel.</span>`)+
        (waOk ? `<a class="la wa" target="_blank" rel="noopener" href="https://wa.me/${escAttr(l.wa)}?text=${waMsg}">${ic("wa")}WhatsApp</a>` : `<span class="la dis">${ic("wa")}—</span>`)+
        (l.mapsUrl ? `<a class="la" target="_blank" rel="noopener" href="${escAttr(l.mapsUrl)}">${ic("pin")}Maps</a>` : `<span class="la dis">${ic("pin")}—</span>`)+
      `</div>`+
      `<div class="funnel">${steps}</div>`+
      `<div class="dtpick"><input type="date" value="${l.fechaReunion||""}"><input type="time" value="${l.horaReunion||"10:00"}"><button class="ok" data-okmeet>Guardar</button></div>`+
      meetHtml+
      `<div class="lfoot">${by}<button class="notebtn${l.notas?" has":""}" data-note>📝 ${l.notas?"Nota":"Nota"}</button></div>`+
      `<div class="notewrap"><textarea placeholder="Notas de la llamada: con quién hablaste, objeciones, cuándo volver…">${esc(l.notas||"")}</textarea></div>`+
    `</div>`;
  return el;
}

/* ---------- card interactions (delegated) ---------- */
function bindGrid() {
  const grid = $("grid");
  grid.addEventListener("click", async e => {
    const card = e.target.closest(".lead"); if (!card) return;
    const id = card.dataset.id, lead = byId[id]; if (!lead) return;

    const note = e.target.closest("[data-note]");
    if (note) { const w = card.querySelector(".notewrap"); const open = w.classList.toggle("show"); if (open){ notesOpen.add(id); w.querySelector("textarea").focus(); } else notesOpen.delete(id); return; }

    const editMeet = e.target.closest("[data-editmeet]");
    if (editMeet) { card.querySelector(".dtpick").classList.add("show"); return; }
    const okMeet = e.target.closest("[data-okmeet]");
    if (okMeet) {
      const dp = card.querySelector(".dtpick");
      const d = dp.querySelector('input[type=date]').value, t = dp.querySelector('input[type=time]').value;
      if (!d) { toast("Pon una fecha"); return; }
      const patch = { estado:"reunion", fechaReunion:d, horaReunion:t };
      if (!lead.gestionadoPor) patch.gestionadoPor = caller();
      await mutate(id, patch); return;
    }

    const step = e.target.closest("[data-step]");
    if (step && !step.classList.contains("locked")) {
      const si = +step.dataset.step, lv = LEVEL[lead.estado] || 0;
      await handleStep(id, lead, si, lv, card); return;
    }
  });
  grid.addEventListener("input", e => {
    if (e.target.tagName !== "TEXTAREA") return;
    const card = e.target.closest(".lead"); const id = card.dataset.id;
    clearTimeout(card._nt);
    card._nt = setTimeout(() => mutate(id, { notas: e.target.value }, true), 500);
    card.querySelector("[data-note]").classList.toggle("has", !!e.target.value);
  });
}
async function handleStep(id, lead, si, lv, card) {
  const patch = {};
  if (si === lv + 1) { // advance
    if (si === 1) patch.estado = "llamado";
    else if (si === 2) { card.querySelector(".dtpick").classList.add("show"); return; } // open picker; commit via okMeet
    else if (si === 3) { patch.estado = "vendido"; toast('<span class="tk">🎉</span> ¡Venta cerrada! +1 para el equipo'); }
    if (!lead.gestionadoPor) patch.gestionadoPor = caller();
  } else if (si === lv) { // step back one level
    const target = ["pendiente","llamado","reunion","vendido"][si-1];
    patch.estado = target;
    if (LEVEL[target] < 2) { patch.fechaReunion = null; patch.horaReunion = null; }
  } else if (si === 2 && lv >= 2) { // edit meeting datetime without changing level
    card.querySelector(".dtpick").classList.add("show"); return;
  } else return;
  await mutate(id, patch);
}
async function mutate(id, patch, isNote) {
  pendingLocal.add(id);
  // optimistic local cache so UI is instant even before echo
  if (byId[id]) Object.assign(byId[id], patch);
  try { await DB.update(id, patch); }
  catch(e) { console.error(e); toast("No se pudo guardar"); }
}

/* ===================================================================
   UI BINDINGS
   =================================================================== */
function bindUI() {
  // search
  const q = $("q"); let qt;
  q.addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => { Q = q.value; applyFilters(); }, 170); });
  // sector chips
  $("sectorChips").addEventListener("click", e => {
    const c = e.target.closest("[data-sector]"); if (!c) return;
    F.sector = c.dataset.sector; buildFacets(); applyFilters();
  });
  $("fEstado").addEventListener("change", e => { F.estado = e.target.value; applyFilters(); });
  $("fCity").addEventListener("change", e => { F.city = e.target.value; applyFilters(); });
  $("fSort").addEventListener("change", e => { F.sort = e.target.value; applyFilters(); });
  // infinite scroll
  new IntersectionObserver(es => { if (es[0].isIntersecting && rendered < filtered.length) renderMore(); }, { rootMargin:"700px" }).observe($("sentinel"));
  // caller edit
  $("callerEdit").addEventListener("click", () => {
    const n = prompt("¿Quién eres? (tu nombre)", caller());
    if (n && n.trim()) { setCaller(n.trim()); rememberCaller(n.trim()); updateCallerChip(); toast("Ahora trabajas como "+n.trim()); }
  });
  // add lead modal
  $("addBtn").addEventListener("click", () => $("addModal").classList.add("show"));
  $("addClose").addEventListener("click", closeAdd);
  $("addCancel").addEventListener("click", closeAdd);
  $("addModal").addEventListener("click", e => { if (e.target.id === "addModal") closeAdd(); });
  $("addSave").addEventListener("click", saveAdd);
  bindGrid();
}
function closeAdd(){ $("addModal").classList.remove("show"); }
async function saveAdd() {
  const bulk = $("aBulk").value.trim();
  let n = 0;
  const mk = (nombre, tel, sector, contacto, city) => {
    const digits = (tel||"").replace(/[^\d]/g,"");
    const valid = digits.length === 9 && /^[6789]/.test(digits);
    return {
      extId: "add-" + Date.now() + "-" + Math.abs(hash(nombre+tel)) + "-" + (n++),
      nombre: nombre.trim(), contacto: (contacto||"").trim(), sector: sector || "Otros",
      ciudad: (city||"").trim(), provincia: "", telefono: valid?tel.trim():"",
      telefonoRaw: valid?("+34"+digits):"", wa: valid?("34"+digits):"", telefonos: tel?tel.trim():"",
      email:"", mapsUrl:"", rating:null, reviews:0, notasOrigen:"", origen:"manual",
      estado:"pendiente", fechaReunion:null, horaReunion:null, gestionadoPor:"", notas:""
    };
  };
  if (bulk) {
    for (const line of bulk.split(/\n+/)) {
      const parts = line.split(/[;,\t]/).map(x=>x.trim());
      if (!parts[0]) continue;
      await DB.add(mk(parts[0], parts[1]||"", parts[2]||$("aSector").value, "", ""));
    }
    toast("Leads añadidos"); closeAdd(); clearAdd(); return;
  }
  const nombre = $("aNombre").value.trim();
  if (!nombre) { toast("Pon al menos el nombre"); return; }
  await DB.add(mk(nombre, $("aTel").value, $("aSector").value, $("aContacto").value, $("aCity").value));
  toast("Lead añadido"); closeAdd(); clearAdd();
}
function clearAdd(){ ["aNombre","aContacto","aTel","aCity","aBulk"].forEach(i=>$(i).value=""); }

/* ===================================================================
   helpers
   =================================================================== */
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function escAttr(s){ return esc(s).replace(/'/g,"&#39;"); }
function cssEsc(s){ return String(s).replace(/["\\]/g,"\\$&"); }
function hash(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0; } return h; }
function fmtDate(d){ if(!d) return ""; const [y,m,da]=d.split("-"); return da+"/"+m+"/"+y; }
function toast(html){ const t=$("toast"); t.innerHTML=html; t.classList.add("show"); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("show"),2400); }
function tween(el, from, to, suffix){
  from = +from||0; to = +to||0;
  clearInterval(el._tw);
  if (from === to) { el.textContent = to + suffix; return; }
  const steps = 12; let i=0;
  el._tw = setInterval(() => { i++; const v = Math.round(from + (to-from)*(i/steps)); el.textContent = v + suffix; if(i>=steps){ el.textContent = to+suffix; clearInterval(el._tw);} }, 20);
}
function ic(n){
  const p={
    phone:'<path d="M3 5c0 8 6 14 14 14l2.5-2.5-3.5-2-2 1.2A12 12 0 0 1 8.3 9l1.2-2-2-3.5L5 6Z" fill="currentColor"/>',
    wa:'<path d="M12 2a9.5 9.5 0 0 0-8.1 14.5L3 22l5.7-1.5A9.5 9.5 0 1 0 12 2Zm5 13.4c-.2.6-1.2 1.1-1.7 1.2-.4 0-1 .2-3-.9-2.5-1.3-4-3.9-4.2-4.1-.1-.2-1-1.3-1-2.4s.6-1.7.8-1.9c.2-.2.4-.3.6-.3h.4c.2 0 .4 0 .6.5l.8 1.9c0 .2.1.4 0 .5l-.4.6c-.2.2-.3.4-.1.7.2.3.8 1.3 1.7 2 .9.6 1.3.8 1.6 1 .2 0 .4 0 .5-.1l.7-.8c.2-.3.4-.2.6-.1l1.8.9c.2.1.4.2.4.3.1.2.1.7-.1 1.3Z" fill="currentColor"/>',
    pin:'<path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" fill="currentColor"/>'
  };
  return `<svg viewBox="0 0 24 24">${p[n]||""}</svg>`;
}

/* ===================================================================
   BOOT
   =================================================================== */
async function main() {
  startLoader();
  DB = MOCK_MODE ? makeMockDB() : makeFirebaseDB();
  const t0 = 1600; // min loader time for the motivational moment
  const started = performance.now();
  try { await DB.ready(); } catch(e){ console.error("DB init failed", e); }
  // login bindings
  $("pwBtn").addEventListener("click", doLogin);
  $("pw").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
  $("whoBtn").addEventListener("click", () => commitWho($("whoInput").value));
  $("whoInput").addEventListener("keydown", e => { if (e.key === "Enter") commitWho($("whoInput").value); });
  $("whoChips").addEventListener("click", e => { const c = e.target.closest("[data-name]"); if (c) commitWho(c.dataset.name); });

  const wait = Math.max(0, t0 - (performance.now() - started));
  setTimeout(() => {
    stopLoader();
    if (MOCK_MODE) { showLogin(); }
    else if (DB.isAuthed && DB.isAuthed()) { if (caller()) enterApp(); else { showLogin(); goWhoStep(); } }
    else showLogin();
    if (MOCK_MODE) showCfgBanner();
  }, wait);
}
function showCfgBanner(){ const b=$("cfgbanner"); b.classList.add("show"); b.textContent="⚙ Modo DEMO local (sin backend). Conecta Firebase en config.js para sincronización en tiempo real entre dispositivos."; }

main();
