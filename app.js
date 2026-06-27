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
const DEVELOPERS = ["Alex","Guille","Dani"];   // asistentes de reunión (developers)
const MEET_MIN = 60;                            // duración asumida por reunión (min) para detectar solapes
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
  // drop the cinematic background once inside the CRM (keep it clean + light)
  const v = $("bgvideo"), t = $("bgtint");
  if (v) { try { v.pause(); } catch(e){} v.classList.add("cine-off"); v.removeAttribute("src"); }
  if (t) t.classList.add("cine-off");
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
let Q = "", F = { sector:"", prio:"", estado:"", city:"", sort:"prio" };
let filtered = [], rendered = 0; const CHUNK = 36;
let currentView = "leads", calDev = "";

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
    if (currentView === "calendario") renderCalendar();   // mantener el calendario en vivo
  });
  bindUI();
  setupNav();
}

/* ===================================================================
   VISTAS (Métricas / Leads / Calendario)
   =================================================================== */
function showView(name) {
  currentView = name;
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + name));
  document.querySelectorAll(".navlink").forEach(n => n.classList.toggle("active", n.dataset.view === name));
  $("mainnav").classList.remove("open");
  try { localStorage.setItem("cc_view", name); } catch(e){}
  if (name === "calendario") renderCalendar();
  window.scrollTo(0, 0);
}
function setupNav() {
  $("mainnav").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) showView(b.dataset.view); });
  $("navToggle").addEventListener("click", e => { e.stopPropagation(); $("mainnav").classList.toggle("open"); });
  document.addEventListener("click", e => { if (!e.target.closest("#mainnav") && !e.target.closest("#navToggle")) $("mainnav").classList.remove("open"); });
  $("brandHome").addEventListener("click", () => window.scrollTo({ top:0, behavior:"smooth" }));
  $("devFilter").addEventListener("click", e => {
    const b = e.target.closest("[data-dev]"); if (!b) return;
    calDev = b.dataset.dev;
    $("devFilter").querySelectorAll(".devchip").forEach(c => c.classList.toggle("on", c.dataset.dev === calDev));
    renderCalendar();
  });
  // restaura la última vista usada
  let v = "leads"; try { v = localStorage.getItem("cc_view") || "leads"; } catch(e){}
  if (!["metricas","leads","calendario"].includes(v)) v = "leads";
  showView(v);
}

/* ===================================================================
   CALENDARIO + detección de conflictos de developer
   =================================================================== */
function timeToMin(t) { if (!t) return 0; const m = String(t).split(":"); return (+m[0]||0)*60 + (+m[1]||0); }
function meetingLeads() {
  // leads con reunión agendada (reunión o vendido) y fecha
  return LEADS.filter(l => (l.estado === "reunion" || l.estado === "vendido") && l.fechaReunion);
}
// devuelve el lead en conflicto (mismo developer, misma fecha, < MEET_MIN de diferencia), o null
function findConflict(developer, date, time, excludeId) {
  if (!developer || !date || !time) return null;
  const t = timeToMin(time);
  for (const l of meetingLeads()) {
    if (l.extId === excludeId) continue;
    if (l.developer !== developer || l.fechaReunion !== date) continue;
    if (Math.abs(timeToMin(l.horaReunion) - t) < MEET_MIN) return l;
  }
  return null;
}
const DOW = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MON = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
function fmtDayHead(date) {
  const [y,m,d] = date.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  return { dd: DOW[dt.getDay()] + " " + d, dn: d + " " + MON[m-1] + " " + y, dt };
}
function renderCalendar() {
  const el = $("calAgenda"); if (!el) return;
  let meets = meetingLeads();
  if (calDev) meets = meets.filter(l => l.developer === calDev);
  $("calCount").textContent = meets.length + (meets.length === 1 ? " reunión" : " reuniones");
  if (!meets.length) {
    el.innerHTML = `<div class="cal-empty"><div class="big">Sin reuniones agendadas</div>${calDev ? "Nadie con "+esc(calDev)+" todavía." : "Agenda una desde la fase «Reunión» de un lead."}</div>`;
    return;
  }
  // agrupar por fecha
  const byDate = {};
  meets.forEach(l => { (byDate[l.fechaReunion] = byDate[l.fechaReunion] || []).push(l); });
  const todayStr = todayISO();
  const html = Object.keys(byDate).sort().map(date => {
    const items = byDate[date].sort((a,b) => timeToMin(a.horaReunion) - timeToMin(b.horaReunion));
    const h = fmtDayHead(date);
    const rows = items.map(l => {
      const dev = l.developer ? `<span class="devtag dev-${esc(l.developer)}"><span class="devdot"></span>${esc(l.developer)}</span>` : "";
      const who = l.gestionadoPor ? `agendó <b>${esc(l.gestionadoPor)}</b>` : "";
      return `<div class="cal-item${l.estado==='vendido'?' sold':''}">`+
        `<div class="time">${esc(l.horaReunion||"—")}</div>`+
        `<div class="info"><div class="nm">${esc(l.nombre)}</div>`+
          `<div class="sub">${esc(l.sector||"")}${l.ciudad?" · "+esc(l.ciudad):""}${who?" · "+who:""}${l.estado==='vendido'?' · VENTA':''}</div></div>`+
        dev + `</div>`;
    }).join("");
    return `<div class="cal-day${date===todayStr?" today":""}"><div class="cal-day-head"><span class="dd">${esc(h.dd)}</span><span class="dn">${esc(h.dn)}</span></div><div class="cal-items">${rows}</div></div>`;
  }).join("");
  el.innerHTML = html;
}
function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
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
  const sec = {}, callers = {};
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
    if (l.gestionadoPor && lv >= 1) {
      const p = l.gestionadoPor;
      if (!callers[p]) callers[p] = { llamadas:0, reuniones:0, ventas:0 };
      callers[p].llamadas++;
      if (lv >= 2) callers[p].reuniones++;
      if (lv >= 3) callers[p].ventas++;
    }
  }
  return { total: LEADS.length, llamados, reuniones, ventas, sec, callers };
}
let prevStats = { total:0, llamados:0, reuniones:0, ventas:0 };
function updateDashboard() {
  const s = computeStats();
  const pct = s.total ? Math.round(s.llamados / s.total * 100) : 0;
  $("pBar").style.width = pct + "%";
  const bb = $("pBar").parentElement; if (bb) bb.classList.toggle("full", pct >= 100);
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
  renderCallerRank(s.callers);
}
function renderCallerRank(callers) {
  const el = $("callerRank"); if (!el) return;
  const me = caller();
  const arr = Object.entries(callers).map(([name, v]) => ({
    name, ...v, pts: v.ventas*100 + v.reuniones*10 + v.llamadas
  })).sort((a,b) => b.ventas-a.ventas || b.reuniones-a.reuniones || b.llamadas-a.llamadas);
  if (!arr.length) { el.innerHTML = `<div class="empty">Aún sin actividad — ¡sé el primero en marcar!</div>`; return; }
  const maxV = Math.max(1, ...arr.map(a=>a.ventas));
  el.innerHTML = arr.map((a, i) => {
    const pos = i+1, mine = a.name === me;
    return `<div class="lb-row${mine?" me":""}${pos<=3?" r"+pos:""}">`+
      `<div class="lb-pos lb-p${pos<=3?pos:0}">${pos}</div>`+
      `<div class="lb-name">${esc(a.name)}${mine?' <span class="lb-you">tú</span>':''}</div>`+
      `<div class="lb-stats">`+
        `<span class="lb-st"><b class="mono">${a.llamadas}</b> llam.</span>`+
        `<span class="lb-st"><b class="mono">${a.reuniones}</b> reun.</span>`+
        `<span class="lb-st lb-v"><b class="mono">${a.ventas}</b> ventas</span>`+
      `</div>`+
      `<div class="lb-bar"><i style="width:${Math.round(a.ventas/maxV*100)}%"></i></div>`+
    `</div>`;
  }).join("");
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
let _facetSig = "";
function buildFacets() {
  const secCount = {}, cityCount = {};
  LEADS.forEach(l => { const s=l.sector||"Otros"; secCount[s]=(secCount[s]||0)+1; if(l.ciudad){cityCount[l.ciudad]=(cityCount[l.ciudad]||0)+1;} });
  const others = Object.keys(secCount).filter(s => !PRELOAD_SECTORS.includes(s)).sort((a,b)=>secCount[b]-secCount[a]);
  const order = [...PRELOAD_SECTORS.filter(s=>secCount[s]), ...others];
  // Rebuild DOM only when the set of leads/sectors/cities actually changes
  // (not on every status tic), so chip scroll position & open menus aren't reset.
  const sig = LEADS.length + "|" + order.length + "|" + Object.keys(cityCount).length;
  if (sig !== _facetSig) {
    _facetSig = sig;
    $("sectorChips").innerHTML =
      `<button class="chip" data-sector="">Todos <span class="n">${LEADS.length}</span></button>` +
      order.map(s => `<button class="chip" data-sector="${escAttr(s)}">${esc(s)} <span class="n">${secCount[s]||0}</span></button>`).join("");
    $("fSector").innerHTML = `<option value="">Todos los sectores (${order.length})</option>` +
      order.map(s=>`<option value="${escAttr(s)}">${esc(s)} (${secCount[s]})</option>`).join("");
    const cities = Object.keys(cityCount).sort((a,b)=>cityCount[b]-cityCount[a]);
    $("fCity").innerHTML = `<option value="">Todas las ciudades</option>` +
      cities.map(c=>`<option value="${escAttr(c)}">${esc(c)} (${cityCount[c]})</option>`).join("");
    $("aSector").innerHTML = order.map(s=>`<option value="${escAttr(s)}">${esc(s)}</option>`).join("");
  }
  syncSectorActive();
}
function syncSectorActive() {
  $("sectorChips").querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c.dataset.sector === F.sector));
  $("fSector").value = F.sector;
}

/* ---------- filters + list ---------- */
function applyFilters() {
  const q = Q.trim().toLowerCase();
  filtered = LEADS.filter(l => {
    if (F.sector && l.sector !== F.sector) return false;
    if (F.prio && l.prio !== F.prio) return false;
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
    if (s==="estado") return (LEVEL[b.estado]||0)-(LEVEL[a.estado]||0) || (b.score||0)-(a.score||0);
    // por prioridad (alta→media→baja) usando el score, luego reseñas
    return (b.score||0)-(a.score||0) || (b.reviews||0)-(a.reviews||0);
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
  if (F.prio && l.prio !== F.prio) return false;
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

  const prio = l.prio || "Baja";
  const meta = [`<span class="prio-pill prio-${prio}"><span class="pd"></span>${prio}</span>`];
  if (l.ciudad) meta.push(`<span class="mi">${ic("pin")} <b>${esc(l.ciudad)}</b></span>`);
  if (l.contacto) meta.push(`<span class="mi">${ic("user")} ${esc(l.contacto)}</span>`);
  if (l.rating != null) meta.push(`<span class="mi star">${ic("star")} ${l.rating} <span style="color:var(--faint)">(${l.reviews||0})</span></span>`);
  if (l.telefono) meta.push(`<span class="mi mono">${esc(l.telefono)}</span>`);

  const phoneOk = !!l.telefonoRaw, waOk = !!l.wa;
  const waMsg = encodeURIComponent(WA_TEMPLATE.replace("{contacto}", l.contacto ? " "+l.contacto.split(/\s+/)[0] : "").replace("{nombre}", l.nombre));

  // funnel steps
  const steps = [["s1","Llamado",1],["s2","Reunión",2],["s3","Venta",3]].map(([cls,label,si]) => {
    let st = "step "+cls;
    if (lv >= si) st += " done";
    else if (lv === si-1) st += " next";
    else st += " locked";
    const mark = lv >= si ? ic("check") : si;
    return `<div class="${st}" data-step="${si}"><div class="sk">${mark}</div><div class="sl">${label}</div></div>`;
  }).join("");

  const devtag = l.developer ? `<span class="devtag dev-${esc(l.developer)}"><span class="devdot"></span>${esc(l.developer)}</span>` : "";
  const meetHtml = (lv >= 2 && l.fechaReunion)
    ? `<div class="meet"><span class="mlab">Reunión</span><span class="mval">${fmtDate(l.fechaReunion)}${l.horaReunion?" · "+l.horaReunion:""}</span>${devtag}<button data-editmeet>editar</button></div>` : "";

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
        (l.mapsUrl ? `<a class="la maps" target="_blank" rel="noopener" href="${escAttr(l.mapsUrl)}">${ic("pin")}Maps</a>` : `<span class="la dis">${ic("pin")}—</span>`)+
      `</div>`+
      `<div class="funnel">${steps}</div>`+
      `<div class="dtpick"><input type="date" value="${l.fechaReunion||todayISO()}"><input type="time" value="${l.horaReunion||"10:00"}">`+
        `<select class="dev-sel"><option value="">Developer…</option>${DEVELOPERS.map(d=>`<option value="${d}"${l.developer===d?" selected":""}>${esc(d)}</option>`).join("")}</select>`+
        `<button class="ok" data-okmeet>Guardar</button><div class="dtpick-msg"></div></div>`+
      meetHtml+
      `<div class="lfoot">${by}<button class="notebtn${l.notas?" has":""}" data-note>${ic("note")} Nota</button></div>`+
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
      const d = dp.querySelector('input[type=date]').value;
      const t = dp.querySelector('input[type=time]').value;
      const dev = dp.querySelector('.dev-sel').value;
      const msg = dp.querySelector('.dtpick-msg');
      msg.classList.remove("ok");
      if (!d || !t) { msg.textContent = "Pon fecha y hora."; return; }
      if (!dev) { msg.textContent = "Elige un developer para la reunión."; return; }
      const conflict = findConflict(dev, d, t, id);
      if (conflict) {
        msg.textContent = `Ocupado — ${dev} ya tiene reunión el ${fmtDate(d)} a las ${conflict.horaReunion} (${conflict.nombre}). Cambia la hora o el developer.`;
        return;
      }
      const patch = { estado:"reunion", fechaReunion:d, horaReunion:t, developer:dev };
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
    else if (si === 3) { patch.estado = "vendido"; toast('<span class="tk">'+ic("trophy")+'</span> ¡Venta cerrada! +1 para el equipo'); }
    if (!lead.gestionadoPor) patch.gestionadoPor = caller();
  } else if (si === lv) { // step back one level
    const target = ["pendiente","llamado","reunion","vendido"][si-1];
    patch.estado = target;
    if (LEVEL[target] < 2) { patch.fechaReunion = null; patch.horaReunion = null; patch.developer = ""; } // ya no hay reunión
    if (target === "pendiente") patch.gestionadoPor = ""; // back to untouched → clear assignee

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
    F.sector = c.dataset.sector; syncSectorActive(); applyFilters();
  });
  // let the chip row scroll horizontally with a normal (vertical) wheel
  $("sectorChips").addEventListener("wheel", e => {
    if (!$("sectorChips").classList.contains("expanded") && e.deltaY) { $("sectorChips").scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive:false });
  // expand/collapse the full sector list
  $("chipsToggle").addEventListener("click", () => {
    const open = $("sectorChips").classList.toggle("expanded");
    $("chipsToggle").classList.toggle("open", open);
    $("chipsToggle").innerHTML = (open ? "Ver menos" : "Ver todos") + ic("chevron");
    $("sectorChips").scrollLeft = 0;   // evita que los chips queden cortados al desplegar tras scrollear
  });
  $("fSector").addEventListener("change", e => { F.sector = e.target.value; syncSectorActive(); applyFilters(); });
  $("fPrio").addEventListener("change", e => { F.prio = e.target.value; applyFilters(); });
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
      email:"", mapsUrl:"", rating:null, reviews:0, score: valid?40:15, prio: valid?"Media":"Baja",
      notasOrigen:"", origen:"manual",
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
// Lucide-style icons (stroke-based). Styling comes from CSS `svg.ic`.
function ic(n){
  const P={
    phone:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    wa:'<path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20l1.2-4.7A8.5 8.5 0 1 1 21 11.5Z"/><path d="M9 9.5c.4 1.2 1.3 2.1 2.5 2.5.3.1.7 0 .9-.3l.3-.4c.2-.3.5-.3.8-.2l1 .5c.3.2.4.5.2.8-.5.6-1.3.9-2 .7-1.9-.4-3.4-1.9-3.8-3.8-.1-.7.1-1.4.7-1.9.3-.2.7-.1.8.2l.5 1c.1.3.1.6-.2.8l-.4.3c-.3.2-.4.6-.3.9Z"/>',
    pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    note:'<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
    check:'<path d="M20 6 9 17l-5-5"/>',
    trophy:'<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    repeat:'<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
    chevron:'<path d="m6 9 6 6 6-6"/>',
    menu:'<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
    calendar:'<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'
  };
  const fill = n==='star' ? ' style="fill:currentColor;stroke:none"' : '';
  return `<svg class="ic" viewBox="0 0 24 24"${fill}>${P[n]||""}</svg>`;
}

/* ===================================================================
   BOOT
   =================================================================== */
function setupStaticIcons() {
  $("searchIc").innerHTML = ic("search");
  $("addIc").innerHTML = ic("plus");
  $("callerEdit").innerHTML = ic("repeat");
  $("chipsToggle").innerHTML = "Ver todos" + ic("chevron");
  $("navToggle").innerHTML = ic("menu");
}
function setupVideo() {
  const v = $("bgvideo"); if (!v) return;
  const ready = () => v.classList.add("ready");
  v.addEventListener("canplay", ready, { once:true });
  if (v.readyState >= 3) ready();
  // some browsers need an explicit play() kick for muted autoplay
  const p = v.play && v.play(); if (p && p.catch) p.catch(()=>{});
}
async function main() {
  setupStaticIcons();
  setupVideo();
  startLoader();
  DB = MOCK_MODE ? makeMockDB() : makeFirebaseDB();
  const t0 = 1600; // min loader time for the motivational moment
  const started = performance.now();
  // Never let a slow/blocked Firebase hang the loader — cap the wait, then show login anyway.
  try {
    await Promise.race([DB.ready(), new Promise((_, rej) => setTimeout(() => rej(new Error("ready-timeout")), 9000))]);
  } catch(e){ console.error("DB init failed/slow", e); }
  // login bindings
  $("pwBtn").addEventListener("click", doLogin);
  $("pw").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
  $("whoBtn").addEventListener("click", () => commitWho($("whoInput").value));
  $("whoInput").addEventListener("keydown", e => { if (e.key === "Enter") commitWho($("whoInput").value); });
  $("whoChips").addEventListener("click", e => { const c = e.target.closest("[data-name]"); if (c) commitWho(c.dataset.name); });

  const wait = Math.max(0, t0 - (performance.now() - started));
  setTimeout(() => {
    stopLoader();
    // Always show the login (cinematic video + password) on each visit, even if the
    // Firebase session is still valid — the team sees the brand gate every time.
    showLogin();
    if (MOCK_MODE) showCfgBanner();
  }, wait);
}
function showCfgBanner(){ const b=$("cfgbanner"); b.classList.add("show"); b.textContent="⚙ Modo DEMO local (sin backend). Conecta Firebase en config.js para sincronización en tiempo real entre dispositivos."; }

main();
