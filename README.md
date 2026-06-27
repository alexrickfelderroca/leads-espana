# 1000 Ventas · Command Center

CRM de equipo **en tiempo real** para la captación telefónica B2B (gremios y autónomos). Todo el equipo entra con una contraseña compartida desde cualquier dispositivo y ve los cambios al instante.

**Acceso:** contraseña del equipo `1000ventas`.
**Backend:** Firebase (Firestore + Auth). Sin Firebase configurado, la web arranca en **modo DEMO local** (datos de ejemplo, sin sync) para poder previsualizarla.

## Funcionalidad
- **919 leads** clasificados por sector (820 de Google Maps + 99 del directorio de gremios del tablón de Sabadell).
- **Embudo de 3 fases** por lead: **Llamado → Reunión agendada (con día y hora) → Venta**. Progresivo, editable y reversible. Registra qué llamador gestionó cada lead.
- **Dashboard en vivo:** barra de progreso hacia el 100 %, contadores de llamados/reuniones/ventas, tasas de conversión y rankings por sector (más «sí», más llamadas, más ventas). Se actualiza solo al marcar tics, en todos los dispositivos.
- Buscador, filtros por sector/ciudad/fase, añadir leads (manual o pegando una lista), pantalla de carga con mensajes motivadores, tema oscuro tipo «sala de ventas».

## Archivos
- `index.html` — estructura + diseño (sistema visual command-center).
- `app.js` — lógica (capa de datos Firebase + demo, login, embudo, dashboard, tiempo real).
- `config.js` — configuración (pega aquí tu `firebaseConfig`).
- `build_seed.js` — normaliza/clasifica y fusiona los leads → `leads-normalized.json`.
- `seed_firestore.mjs` — carga inicial de los leads en Firestore.
- `SETUP-FIREBASE.md` — guía paso a paso para conectar Firebase.

## Puesta en marcha
1. Sigue **[SETUP-FIREBASE.md](SETUP-FIREBASE.md)** y pega el `firebaseConfig` en `config.js`.
2. `npm install firebase` y crea `firebase-config.json` (ver el script).
3. `node seed_firestore.mjs` para cargar los 919 leads.
4. Publica con GitHub Pages (rama `main`, raíz). La web queda en `https://<usuario>.github.io/<repo>/`.

> El diseño no usa el típico look de IA: paleta navy/ámbar/esmeralda, tipografías Bricolage Grotesque + Work Sans + Geist Mono, bordes definidos en vez de sombras difusas, maquetación en grid de panel.
