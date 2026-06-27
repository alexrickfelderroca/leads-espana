# Leads — Negocios sin web (España)

Panel privado para gestionar la prospección de negocios españoles **sin página web** (datos públicos de Google Maps). Pensado para llamar/escribir por WhatsApp desde el móvil y llevar el control de a quién ya has contactado.

**Web:** se publica con GitHub Pages (ver más abajo).
**Acceso:** protegido por contraseña. Contraseña actual: `serres2026` — para cambiarla, sustituye `PW_HASH` en `index.html` por el SHA-256 de la nueva, o pídeme que la cambie.

## Qué incluye
- **820 leads** ordenados por prioridad (demanda + reputación + contactable).
- Botones **Llamar** (`tel:`), **WhatsApp** (`wa.me` con mensaje precargado), **Maps** y **Email** que funcionan en cualquier móvil.
- **Seguimiento de llamadas**: marca cada lead (Por llamar → Llamado → Volver a llamar → Interesado → Cliente cerrado / No interesado), con notas y fecha de último contacto. Se guarda solo en tu navegador.
- Barra de progreso, búsqueda y filtros por ciudad, sector, prioridad y estado.
- **Exportar / Importar** tu progreso (copia de seguridad o pasarlo a otro dispositivo) y tema claro/oscuro.

## Archivos
- `index.html` — la app (autocontenida).
- `leads-data.js` — los datos embebidos (funciona también abriendo el archivo en local).
- `leads.json` — los mismos datos en JSON.
- `build.js` — regenera los datos desde el scrape original.

## Regenerar los datos
```bash
node build.js
```
Lee el scrape de Google Maps desde la carpeta de origen y reescribe `leads.json` + `leads-data.js`.

## Publicar (GitHub Pages)
Settings → Pages → Branch `main` / `/ (root)`. La web queda en `https://<usuario>.github.io/<repo>/`.
