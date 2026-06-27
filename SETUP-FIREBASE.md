# Conectar Firebase (sincronización en tiempo real)

Pasos de una sola vez (~5 min). Al final me pegas **2 cosas** y yo termino el resto (cargo los 919 leads, despliego y compruebo que sincroniza entre dispositivos).

## 1. Crear el proyecto
1. Entra en https://console.firebase.google.com → **Crear un proyecto**.
2. Nombre: `1000-ventas` (o el que quieras). Google Analytics: puedes **desactivarlo** (no hace falta). → **Crear proyecto**.

## 2. Base de datos (Firestore)
3. Menú izquierdo → **Build → Firestore Database** → **Crear base de datos**.
4. Modo: **Producción**. Ubicación: **eur3 (europe-west)** (o la más cercana). → **Habilitar**.
5. Pestaña **Reglas (Rules)** → borra lo que haya y pega esto → **Publicar**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leads/{doc} {
      allow read, write: if request.auth != null
        && request.auth.token.email == 'equipo@1000ventas.app';
    }
  }
}
```
> Esto hace que **solo la cuenta del equipo** pueda ver/editar los leads. Aunque alguien tenga la URL, sin la contraseña no entra.

## 3. Acceso (Authentication)
6. **Build → Authentication → Comenzar**.
7. Pestaña **Sign-in method** → **Correo electrónico/contraseña** → **Habilitar** → Guardar.
8. (Recomendado) En **Authentication → Settings → User actions**, **desactiva** «Enable create (sign-up)» para que nadie pueda registrarse por su cuenta.
9. Pestaña **Users** → **Add user**:
   - Email: `equipo@1000ventas.app`
   - Contraseña: `1000ventas`
   - → **Add user** (queda confirmado automáticamente).

## 4. Obtener la configuración web
10. Arriba a la izquierda, rueda dentada ⚙ → **Configuración del proyecto**.
11. Baja a **Tus apps** → icono **Web `</>`** → registra la app (apodo: `1000 ventas web`, **sin** Hosting) → **Registrar app**.
12. Copia el objeto `firebaseConfig` que aparece (algo así):

```js
const firebaseConfig = {
  apiKey: "AIza…",
  authDomain: "1000-ventas.firebaseapp.com",
  projectId: "1000-ventas",
  storageBucket: "1000-ventas.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef…"
};
```

## 5. Pásamelo
**Pégame aquí ese bloque `firebaseConfig`.** Con eso yo:
- Lo pongo en `config.js`,
- Cargo los **919 leads** en tu Firestore (todo a 0, «por llamar»),
- Despliego la web y verifico que un cambio en un móvil aparece al instante en otro.

> El `apiKey` de Firebase **no es secreto** (es un identificador público); la seguridad la dan las reglas + la contraseña. Sin problema en pegármelo.
