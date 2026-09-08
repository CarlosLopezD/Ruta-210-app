# Ruta 210 App

Proyecto personal de portfolio: una app full-stack que toma los datos de
pickup/dropoff de un viaje y las horas del ciclo HOS que el conductor ya
tiene usadas, y devuelve una ruta más las **Daily Log Sheets** (ELD)
generadas automáticamente. Arrancó como ejercicio técnico de Full Stack
Developer y siguió creciendo como proyecto propio, con varias funcionalidades
agregadas después

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

## Estructura del proyecto

```
backend/          API Django + DRF
  accounts/        User propio (login por email), register/login/refresh/me (JWT)
  trips/           geocoding, ruteo, motor HOS, endpoint /plan/, CRUD del historial
frontend/          SPA React + Vite + TypeScript
  src/context/      Providers de Theme, Language y Auth
  src/pages/        PlannerPage (pública), HistoryPage ("Mis viajes", protegida)
docs/              capturas
docker-compose.yml  Postgres local para desarrollo
render.yaml        Blueprint de Render para el backend
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
python manage.py test        # 30 tests: motor HOS, API de viajes, auth, historial
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
cp .env.example .env          # VITE_API_BASE_URL=http://127.0.0.1:8000
npm run dev
```

Abrí http://localhost:5173, completá el formulario (o hacé click en **"Usar
ejemplo"** para autocompletar un viaje de muestra), y hacé click en
**Planificar viaje**. Creá una cuenta desde el header para probar guardar un
viaje y la página de **Mis viajes**.

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
stops, daily_logs } Errores: `400` por input inválido, `502`
si falla geocoding/ruteo.

**Auth**:
- `POST /api/auth/register/` — `{ email, password, display_name? }` → tokens + user.
- `POST /api/auth/login/` — `{ email, password }` → tokens + user.
- `POST /api/auth/refresh/` — `{ refresh }` → nuevo access token.
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
- **Sin `DATABASE_URL` seteada en producción, el historial de viajes vive en
  el disco local del backend** — anda bien para desarrollo local (archivo
  SQLite), pero la mayoría de los hosts gratuitos (Render incluido) borran
  ese disco en cada redeploy. Seteá `DATABASE_URL` a una instancia real de
  Postgres para un historial que realmente persista
- Los access tokens JWT duran 60 minutos, los refresh tokens 7 días; no hay
  "recordarme" / sesión de más larga duración que eso.

## Tests

```bash
cd backend && source .venv/bin/activate && python manage.py test -v 2
```

30 tests: 14 para el motor HOS + la API de planificación (viajes de un día
vs. multi-día, el tope de 11 horas de manejo, paradas de combustible cada
≤1.000 millas, el reset de 70 horas del ciclo, duración configurable de
carga/descarga, hora de inicio opcional), 7 de auth (register/login/me,
validaciones), y 9 de historial de
viajes (guardar/listar/actualizar status/borrar/actualizar anotaciones y —
lo más importante — que un usuario nunca puede ver ni modificar los viajes
de otro, anotaciones incluidas). Los tests de backend mockean
geocoding/ruteo para correr offline y de forma determinística.
