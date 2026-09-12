# Ruta 210 App

Proyecto personal de portfolio: una app full-stack que toma los datos de
pickup/dropoff de un viaje y las horas del ciclo HOS que el conductor ya
tiene usadas, y devuelve una ruta más las **Daily Log Sheets** (ELD)
generadas automáticamente, con varias funcionalidades agregadas después de
la versión inicial.

**Stack:** Django + Django REST Framework (backend) · React + Vite +
TypeScript (frontend) · OSRM para el ruteo · Nominatim (OpenStreetMap) para
geocoding · React-Leaflet para el mapa · JWT auth (SimpleJWT) · SQLite
(default) o Postgres vía `DATABASE_URL`. **Planificar un viaje nunca requiere
cuenta** — el login solo hace falta para guardar viajes en un historial
personal.

![Estado vacío](docs/screenshots/form.png)
![Resultado de un viaje, tema oscuro, con la barra de guardar](docs/screenshots/result-dark-save.png)
![Mis viajes — un viaje guardado reabierto, en español](docs/screenshots/history-es.png)

## Cómo funciona

1. Ingresás **ubicación actual**, **punto de pickup**, **punto de dropoff** y
   las **horas ya usadas del ciclo** — sin necesidad de cuenta.
2. El backend geocodifica las tres direcciones, pide la ruta de manejo de
   cada tramo a OSRM, y corre un motor de simulación HOS (Horas de Servicio)
   que recorre el viaje e inserta automáticamente:
   - 1 hora on-duty en el pickup y en el dropoff (o la duración que se haya
     configurado),
   - un descanso de 30 minutos después de 8 horas de manejo,
   - un reset de 10 horas off-duty al llegar al límite de 11 horas de manejo
     / 14 horas de ventana on-duty,
   - una parada de combustible cada ≤1.000 millas,
   - un restart de 34 horas si el ciclo de 70 horas/8 días se agotaría en
     medio del viaje.
3. El resultado se divide en una **Daily Log Sheet por día calendario**,
   renderizada como grilla SVG con el formato clásico de la hoja ELD en
   papel de la FMCSA (Off Duty / Sleeper Berth / Driving / On Duty, grilla de
   24 horas, línea escalonada de estado, totales, remarks) — más un mapa de
   la ruta con todas las paradas marcadas.
4. Opcionalmente, podés crear una cuenta para **guardar un viaje
   planificado** y hacerle seguimiento en **Mis viajes**, donde podés
   marcarlo como Planificado / En curso / Finalizado, reabrir su mapa y sus
   hojas de log (sin volver a pedir los datos), o borrarlo.

## Funcionalidades agregadas después de la v1

- **Tema claro/oscuro** — switch animado en el header, persistido por
  navegador, con valor inicial según la preferencia del sistema operativo.
  El mapa siempre se renderiza con tiles claros (incluso en modo oscuro)
  para que los marcadores de colores de las paradas se sigan viendo bien y
  la ruta nunca se confunda con un estado de error.
- **Español/Inglés** — selector en el header, persistido por navegador, con
  default según el idioma del navegador. Contexto/diccionario hechos a
  mano, sin librería de i18n.
- **Cuentas + historial de viajes** — registro/login con email y contraseña
  (JWT). Guardá un viaje planificado, vealo en **Mis viajes**, marcá su
  status con un control de 3 estados tipo check (Planificado / En curso /
  Finalizado), reabrí su mapa y sus hojas de log, o borralo. Cada usuario ve
  únicamente sus propios viajes (aislado a nivel servidor, no solo oculto en
  la UI).
- **Horario real de inicio + duración configurable de carga/descarga** — una
  sección de "Opciones avanzadas" en el formulario te deja indicar la
  fecha/hora real de inicio del viaje y cuánto tarda cada carga y descarga
  (en vez de asumir 1 hora fija). Ambos datos alimentan la simulación HOS
  real, y el resultado muestra fechas/horarios de calendario reales en vez
  de solo "Día N".
- **Anotaciones de texto libre en las hojas ELD** — agregá una nota en
  cualquier horario del día (como el campo "Remarks" de una hoja ELD en
  papel), tanto en un viaje recién planificado como en uno ya guardado en tu
  historial; en un viaje guardado, cada anotación se persiste al instante.
- **Verificación de email + recuperación de contraseña** — el registro exige
  confirmar el email antes de poder iniciar sesión (con reenvío del link de
  confirmación), y hay un flujo de "olvidé mi contraseña" por email. Login
  con rate limiting por IP y bloqueo temporal de la cuenta tras intentos
  fallidos repetidos.
- **Refresh token en cookie httpOnly** — el access token JWT vive solo en
  memoria (nunca en localStorage), y el refresh token viaja únicamente en
  una cookie `httpOnly` + `SameSite=Lax`, invisible a JavaScript (incluido un
  eventual XSS). Ver [Autenticación y sesión](#autenticación-y-sesión) para
  el detalle de cómo funciona esto sin necesitar un esquema de CSRF aparte.

## Autenticación y sesión

El access token JWT se guarda solo en una variable en memoria (se pierde al
recargar la página, y se vuelve a pedir en silencio con el refresh token). El
refresh token nunca es visible para JavaScript: vive únicamente en una cookie
`httpOnly`, con scope acotado a `/api/auth/` y `SameSite=Lax`.

`SameSite=Lax` alcanza como protección CSRF (sin necesitar un esquema de
token de CSRF aparte) solo porque el frontend y el backend se sirven desde
**el mismo origen** ante el navegador — si fueran orígenes distintos, la
cookie necesitaría `SameSite=None`, y eso sí requeriría CSRF real. Por eso:

- **En producción**, el frontend (`ruta-210-app.lcarlosdario2020.workers.dev`)
  corre detrás de un **Cloudflare Worker** (`frontend/worker/index.ts`) que
  actúa de reverse proxy: sirve el build estático para todo excepto `/api/*`,
  que reenvía server-to-server al backend real en Render (configurado en
  `frontend/wrangler.jsonc` vía `run_worker_first` + la variable
  `API_ORIGIN`). Para el navegador, todo el tráfico —assets estáticos y
  API— sale del mismo origen.
- **En desarrollo local**, `npm run dev` hace lo mismo con el proxy nativo de
  Vite (`server.proxy` en `frontend/vite.config.ts`): las llamadas a
  `/api/*` desde `localhost:5173` se reenvían a `127.0.0.1:8000`. Por eso
  `frontend/.env.example` trae `VITE_API_BASE_URL` vacío — si se apunta
  directo al backend (otro origen), el login sigue funcionando pero el
  refresh silencioso al recargar la página no, porque la cookie no viaja
  cross-origin.

Tokens: el access dura 60 minutos, el refresh 7 días y rota en cada uso (el
anterior queda en una blacklist). No hay "recordarme" — pasados los 7 días
hay que loguearse de nuevo.

## Estructura del proyecto

```
backend/          API Django + DRF
  accounts/        User propio (login por email), register/login/refresh/me (JWT + cookie)
  trips/           geocoding, ruteo, motor HOS, endpoint /plan/, CRUD del historial
  config/          settings, checks de arranque en producción, endpoint de reset de demo
frontend/          SPA React + Vite + TypeScript
  src/context/      Providers de Theme, Language y Auth
  src/pages/        PlannerPage (pública), HistoryPage ("Mis viajes", protegida)
  worker/           Cloudflare Worker: reverse proxy de /api/* hacia el backend
  wrangler.jsonc    Config del deploy en Cloudflare (assets + el Worker de arriba)
docs/              capturas
docker-compose.yml  Postgres local para desarrollo
render.yaml        Blueprint de Render para el backend
.github/workflows/  CI (tests + build) y el reset periódico de la demo
```

## Cómo correrlo en local

### Backend

macOS/Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # los defaults andan bien — corre en SQLite sin configurar nada
python manage.py migrate
python manage.py test        # 66 tests: motor HOS, API de viajes, auth, historial, config
python manage.py runserver 8000
```

Windows (PowerShell):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py test
python manage.py runserver 8000
```

> `&&` solo encadena comandos en PowerShell 7+ — en Windows PowerShell 5.1
> (la versión que viene por default en Windows) corré cada línea por
> separado, como arriba. Si `Activate.ps1` queda bloqueado por la política
> de ejecución, corré una vez: `Set-ExecutionPolicy -Scope Process
> -ExecutionPolicy Bypass`, y activá de nuevo en la misma ventana. Si
> `python` no se reconoce, probá con `py`.

**Opcional: correr Postgres local en vez de SQLite** (requiere Docker):

```bash
docker compose up -d db          # desde la raíz del proyecto
```

Después seteá `DATABASE_URL=postgres://eld_user:eld_pass@localhost:5432/eld_trip_planner`
en `backend/.env` (el ejemplo ya está comentado ahí) y volvé a correr
`python manage.py migrate`. Dejá `DATABASE_URL` vacía/sin setear para seguir
usando SQLite — las dos opciones funcionan igual para desarrollo local,
Postgres solo vale la pena si querés que tu entorno local sea un espejo de
producción.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env          # VITE_API_BASE_URL vacío — ver nota abajo
npm run dev
```

Abrí http://localhost:5173, completá el formulario (o hacé click en **"Usar
ejemplo"** para autocompletar un viaje de muestra), y hacé click en
**Planificar viaje**. Creá una cuenta desde el header para probar guardar un
viaje y la página de **Mis viajes**.

> `VITE_API_BASE_URL` va vacío a propósito: `npm run dev` proxea `/api/*` al
> backend en `127.0.0.1:8000` (ver `server.proxy` en `vite.config.ts`), así
> que el navegador ve todo como un solo origen — lo mismo que hace el
> Cloudflare Worker en producción, y por la misma razón: es lo que permite
> que la cookie httpOnly del refresh token viaje (ver [Autenticación y
> sesión](#autenticación-y-sesión)). Con el backend corriendo en el puerto
> 8000 (el default de arriba), no hay que tocar nada más.

> Geocoding (Nominatim) y ruteo (OSRM) llaman a servicios públicos y sin
> API key sobre internet abierto — necesitan acceso de red saliente para
> funcionar.

## API

`POST /api/trips/plan/` — pública, sin auth.

```json
{
  "current_location": "Dallas, TX",
  "pickup_location": "Fort Worth, TX",
  "dropoff_location": "Oklahoma City, OK",
  "current_cycle_used": 12,
  "start_datetime": "2026-01-05T08:00:00Z",
  "pickup_duration_hours": 2,
  "dropoff_duration_hours": 1.5
}
```

`start_datetime`, `pickup_duration_hours` y `dropoff_duration_hours` son
todos opcionales — omitilos para obtener el comportamiento anterior (arranca
"ahora", 1 hora para cada parada). Devuelve `{ summary, route, locations,
stops, daily_logs }`. Errores: `400` por input inválido, `502`
si falla geocoding/ruteo.

**Auth**: el registro ya no inicia sesión automáticamente — la cuenta queda
sin verificar hasta que el usuario confirma el email, y el login rechaza
cuentas no verificadas. También hay bloqueo temporal tras varios intentos
fallidos de login y rate limiting por IP en todos los endpoints de auth.

- `POST /api/auth/register/` — `{ email, password, display_name? }` → `201`
  con `{ detail, email }` (sin tokens) y dispara el email de verificación.
- `POST /api/auth/verify-email/` — `{ uid, token }` (del link del email) →
  marca la cuenta como verificada y devuelve el usuario.
- `POST /api/auth/resend-verification/` — `{ email }` → reenvía el email de
  verificación si la cuenta existe y todavía no está verificada. Responde
  `200` con un mensaje genérico en ambos casos (no revela si el email existe).
- `POST /api/auth/login/` — `{ email, password }` → `{ access, user }` +
  setea la cookie httpOnly del refresh token (nunca va en el body — ver
  [Autenticación y sesión](#autenticación-y-sesión)). `401` por credenciales
  inválidas; `400` con `code: "email_not_verified"` si la cuenta no confirmó
  su email, o `code: "account_locked"` tras 5 intentos fallidos (bloqueo de
  15 minutos).
- `POST /api/auth/refresh/` — sin body: lee el refresh token de la cookie
  httpOnly → `{ access }` y renueva esa misma cookie (rota en cada uso, el
  anterior queda blacklisteado). `401` si no hay cookie o es inválida/venció.
- `POST /api/auth/logout/` — sin body (requiere `Authorization: Bearer
  <access>`) → invalida (blacklist) el refresh token de la cookie y la borra.
- `POST /api/auth/password-reset/` — `{ email }` → envía un link de reset si
  la cuenta existe. Mismo mensaje genérico que `resend-verification`.
- `POST /api/auth/password-reset/confirm/` — `{ uid, token, new_password }` →
  actualiza la contraseña y desbloquea la cuenta si estaba bloqueada.
- `GET /api/auth/me/` — usuario actual (requiere `Authorization: Bearer <access>`).

**Historial de viajes** (todos requieren `Authorization: Bearer <access>`,
todos scoped al usuario autenticado):
- `GET /api/trips/history/` — listar viajes guardados.
- `POST /api/trips/history/` — guardar un viaje: los 4 inputs del
  planificador + `status` + el JSON `plan_result` exacto que devolvió
  `/api/trips/plan/` (evita volver a pegarle a Nominatim/OSRM para
  mostrar de nuevo un viaje guardado).
- `PATCH /api/trips/history/<id>/` — actualiza `{ status }` (`planned` |
  `in_progress` | `completed`), **o** `{ plan_result }` para guardar
  cambios en las anotaciones de las Daily Log Sheets de ese viaje (se manda
  el `plan_result` completo actualizado, no un diff).
- `DELETE /api/trips/history/<id>/` — borra un viaje guardado.

**Mantenimiento de la demo pública**:
- `POST /api/system/reset-demo/` — borra **todos** los datos (cuentas y
  viajes, ver [Datos de la demo pública](#datos-de-la-demo-pública)).
  Requiere un header `X-Reset-Token` que matchee `DEMO_RESET_TOKEN`; sin ese
  header, o si la variable no está configurada en el deploy, devuelve `403`
  siempre. No pensado para llamarse desde el frontend.

## Datos de la demo pública

Esto es un proyecto de portfolio con una demo pública, no un producto con
usuarios reales — así que **cada ~30 minutos se borran todas las cuentas y
todos los viajes** guardados en la instancia de producción
(`ruta-210-app.lcarlosdario2020.workers.dev`), vía un
[workflow de GitHub Actions](.github/workflows/reset-demo-data.yml)
programado que llama a `POST /api/system/reset-demo/`. Si estás evaluando
este proyecto y tu cuenta de prueba desaparece, es por esto, no un bug — el
horario del workflow (aproximado, GitHub no garantiza el minuto exacto) está
en `.github/workflows/reset-demo-data.yml`.

## Limitaciones conocidas

- **El servidor demo público de OSRM** (`router.project-osrm.org`) no tiene
  SLA — suficiente para este proyecto.
- **Nominatim** limita a ~1 request/segundo; esta app hace como máximo 3
  llamadas de geocoding por viaje, bien dentro de ese límite.
- **Split sleeper-berth** (7/3, 8/2) no está modelado — los resets off-duty
  son un único bloque continuo, la simplificación habitual para este tipo
  de ejercicio.
- Si no se indica una fecha/hora de inicio, el viaje se asume que **arranca
  a las 00:00 del Día 1**.
- **SQLite es solo para desarrollo local** (`DJANGO_DEBUG=True`) — corre en
  un archivo en disco, sin setup extra. En producción (`DJANGO_DEBUG=False`)
  el backend ahora **exige** `DATABASE_URL` y no arranca sin ella, en vez de
  caer silenciosamente a un SQLite que la mayoría de los hosts gratuitos
  (Render incluido) borran en cada redeploy. En producción usa Postgres en
  [Neon](https://neon.tech) (plan free) — Neon pausa el compute tras un rato
  de inactividad; la primera consulta después de eso puede tardar unos
  segundos extra en lo que arranca de nuevo, sin perder datos.
- Ver [Datos de la demo pública](#datos-de-la-demo-pública) — todo se borra
  automáticamente cada ~30 minutos en la instancia pública.
- Los access tokens JWT duran 60 minutos, los refresh tokens 7 días; no hay
  "recordarme" / sesión de más larga duración que eso (ver [Autenticación y
  sesión](#autenticación-y-sesión)).

## Tests

Backend (66 tests):

```bash
cd backend && source .venv/bin/activate && python manage.py test -v 2
```

23 para el motor HOS + la API de planificación y el historial de viajes
(viajes de un día vs. multi-día, el tope de 11 horas de manejo, paradas de
combustible cada ≤1.000 millas, el reset de 70 horas del ciclo, duración
configurable de carga/descarga, hora de inicio opcional, guardar/listar/
actualizar status/borrar/actualizar anotaciones y — lo más importante — que
un usuario nunca puede ver ni modificar los viajes de otro), 28 de auth
(register/login/me/logout, verificación de email, recuperación de
contraseña, bloqueo de cuenta tras intentos fallidos, rate limiting, la
cookie httpOnly del refresh token y su rotación/blacklist), y 15 en `config`
— 9 que confirman que el arranque en producción falla explícito si falta
`DJANGO_SECRET_KEY` o `DATABASE_URL` en vez de usar un fallback inseguro o
silencioso, y 6 para el endpoint de reset de la demo (que se niega siempre
si `DEMO_RESET_TOKEN` no está configurado, incluso con un header vacío, y
que efectivamente borra todo con el token correcto). Los tests mockean
geocoding/ruteo para correr offline y de forma determinística.

Frontend (21 tests):

```bash
cd frontend && npm test -- --run
```

Tests de componentes (Vitest + Testing Library) para el modal de
autenticación (login, registro, verificación pendiente, reenvío de
verificación y recuperación de contraseña, mensajes de error genéricos vs.
específicos) y para `AuthContext` (arranque de sesión con/sin usuario
cacheado, refresh silencioso vía cookie, qué pasa si ese refresh falla por
sesión vencida vs. por un error de red, login/logout, reintento automático
de una request que dio 401). Más 4 tests de unidad, sin dependencias de
Cloudflare, para la función pura que arma la URL upstream del Worker
(`frontend/worker/index.test.ts`).
