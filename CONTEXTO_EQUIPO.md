# Contexto para trabajar en equipo — reconocimiento de 20 palabras de LSC

> Para quien se suma al proyecto. Explica qué estamos haciendo, qué se descubrió,
> y cuál es la tarea concreta que te toca. Al final hay un texto listo para pegarle
> a tu Claude Code.

---

## 1. El proyecto

**Traduce Señas**: app que traduce Lengua de Señas Colombiana. Tiene backend (Express +
TypeScript + Postgres) y frontend (React Native / Expo, se usa en web).

**El objetivo actual:** que la app reconozca **20 palabras** de LSC frente a la cámara,
usando un dataset público llamado **LSC-54** en vez de grabar señas nosotros.

**Los tres repositorios:**

| Repo | Para qué | Rama de trabajo |
|---|---|---|
| `https://github.com/mauro-1508/backendTS.git` | Backend | `feat/backend-dominios-ia` |
| `https://github.com/tadeo77789/frontendTS.git` | App | `feat/ia-20-palabras` |
| `https://github.com/code-sena/trans-sl-docs.git` | Documentación | `feat/dataset-lsc54` |

**Ya está hecho y subido:** el backend reorganizado por dominios (`auth`, `users`,
`translations`, `ia`), el motor de MediaPipe portado al frontend, y el formato real del
dataset documentado.

---

## 2. Cómo reconoce señas la app (importante para entender la tarea)

1. **MediaPipe** convierte lo que ve la cámara en **21 puntos** de la mano (muñeca, nudillos,
   puntas de dedos), cada uno con coordenadas x, y, z.
2. Esos puntos se **normalizan**: se centran en la muñeca y se dividen por el tamaño de la
   palma, para que dé igual la distancia a la cámara o la posición en pantalla.
3. La secuencia se recorta a **16 frames**.
4. Se compara contra **plantillas** guardadas (ejemplos de cada palabra) usando **DTW**, un
   método que compara secuencias aunque vayan a distinta velocidad. Gana la más cercana, si
   la distancia es menor a `1.1`.

Código de referencia en el frontend:
`src/feature/Translation/services/vision/` → `normalize.ts`, `motionTemplateStore.ts`,
`motionClassifier.ts`.

> **La limitación clave:** al centrar todo en la muñeca, la app **solo compara la forma de los
> dedos**. No sabe dónde está la mano ni cómo se desplaza, y solo mira **una** mano. Dos señas
> con la misma forma pero distinto movimiento o ubicación le parecen iguales.

---

## 3. El dataset LSC-54 y lo que descubrimos

**Qué es:** 54 señas colombianas (saludos/cortesía, 11 colores, números 1–10), grabadas por
22 personas. Los autores ya les pasaron MediaPipe: el dataset trae **los puntos ya extraídos**,
no los videos. Licencia **CC BY-NC 4.0** (uso no comercial, hay que citarlo).

Artículo: Mora-Zarate et al., *Data in Brief* (2025), https://doi.org/10.1016/j.dib.2025.112145
Datos: https://www.scidb.cn/en/detail?dataSetId=0fa5acc6293543bba9a39a822988843e

**Cómo viene el archivo** (`datos.json`, **55 GB**, texto JSON indentado):

```
Signer_1 / Colores / amarillo / vid_1 / rep_0 / frame_0 / { r_hand, l_hand, face, pose }
```

Cada parte guarda sus coordenadas por columnas: `{"x": [21 números], "y": [...], "z": [...]}`.

**Hallazgos que cambian el plan** (todos verificados sobre los datos, están en
`docs/06-data/datasets/lsc54.md` del repo de documentación):

| Hallazgo | Por qué importa |
|---|---|
| `rep_N` **no** son repeticiones distintas: son la misma grabación **corrida en x** (aumentación del dataset) | Después de normalizar quedan **idénticas**. Solo sirve `rep_0` de cada video |
| La cantidad de reps por video **varía** (vimos 3 y 5) | No se puede saltar "de a 45" a ciegas: hay que recorrer las fronteras |
| Las muestras **no** tienen 30 frames: van de 40 a 133, y cada persona arrancó en distinto momento | Hay que recortar al tramo activo |
| Cuando MediaPipe no vio la mano, rellenaron los 21 puntos con **4 puntos del cuerpo** | Esos frames hay que descartarlos (se detectan porque tienen ≤ 4 posiciones distintas) |
| La mano que trabaja suele ser `l_hand` | El conversor debe elegir la mano por cuál se mueve, no por el nombre |
| La cara ocupa el **84 %** de los bytes y no la usamos | Al bajar, se descarta y se guarda solo manos + pose |

---

## 4. Tu tarea: bajar la mitad del dataset

**Por qué se reparte:** el servidor (está en China) limita la velocidad **por conexión a
internet**: da unos 240 KB/s sin importar cuántas conexiones abras. Poner más procesos en una
misma máquina no acelera, y de hecho nos hizo caer con error **HTTP 429** ("vas muy rápido").
Pero **dos casas distintas = dos límites distintos**, así que repartir sí parte el tiempo a la
mitad de verdad.

**Cómo funciona el descargador:** no baja los 55 GB. Usa peticiones por rangos (pedir "dame
del byte X al Y") para bajar **solo el `rep_0`** de cada grabación, y de cada frame guarda solo
manos y pose. Va anotando por dónde va, así que **es reanudable**: si se corta, lo vuelves a
lanzar y sigue.

### Paso 1 — Requisitos

```bash
node -v      # tiene que decir v20 o superior
git --version
```

Si `node -v` dice menos de v20, instala Node desde https://nodejs.org (versión LTS).
**No** necesitas base de datos, ni `.env`, ni levantar el backend. Solo Node y conexión.

Espacio en disco: la descarga mueve unos **5 GB de tráfico**, pero en disco quedan solo
**~110 MB**, porque de cada muestra se guardan únicamente manos y pose.

### Paso 2 — Clonar el repo y ponerte en la rama

```bash
git clone https://github.com/mauro-1508/backendTS.git
cd backendTS
git switch feat/backend-dominios-ia
npm install
```

Verifica que quedaste en la rama correcta:

```bash
git branch --show-current     # debe decir: feat/backend-dominios-ia
```

**Actualiza antes de empezar y de vez en cuando**, que la rama se mueve:

```bash
git pull
```

### Paso 3 — Lanzar TU tramo

Tu tramo es el **2 de 2**. El tramo 1 lo está bajando la otra máquina; si bajas el mismo,
duplicamos trabajo y no ganamos nada.

```bash
npm run ia:download-lsc54 -- --slice 2/2 --workers 4 --max-samples 800
```

Deja esa terminal abierta. Si prefieres que quede corriendo aparte y con registro en archivo:

```bash
# Windows (PowerShell)
npm run ia:download-lsc54 -- --slice 2/2 --workers 4 --max-samples 800 *> descarga.log

# Linux / macOS
npm run ia:download-lsc54 -- --slice 2/2 --workers 4 --max-samples 800 > descarga.log 2>&1 &
```

**Cuánto tarda:** entre 8 y 16 horas para las 800 muestras. Puedes cortarlo cuando
quieras con `Ctrl+C` y retomarlo después **con el mismo comando**: sigue donde iba.
Apagar el computador tampoco pierde nada.

### Paso 4 — Qué vas a ver, y qué significa

Al arrancar:

```
LSC-54 rep_0: 4 trabajadores pendientes de 4
```

Luego, una línea por muestra bajada:

```
19:25:46 [w00] Signer_1/Colores/amarillo/vid_1 133 frames, 13.0 MB | total 2
19:26:38 [w03] vid_1 34 frames, 2.6 MB | total 3
```

- `[w00]` es cuál de los 4 trabajadores fue.
- Después va la ruta de la muestra. A veces sale corta (solo `vid_1`): significa que sigue en
  la misma seña que la línea anterior de ese trabajador. **Es normal**, no es un error.
- `total` es el acumulado. **Mientras `total` suba, todo va bien.**
- Los primeros minutos pueden pasar **sin ninguna línea**: tres de los cuatro trabajadores
  arrancan a mitad de una grabación y tienen que avanzar hasta el primer corte. Normal.

Otros mensajes:

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| `ERROR ... HTTP 429` suelto | El servidor te frenó un momento | Nada, el programa espera y reintenta solo |
| `HTTP 429` muy seguido | El servidor te está limitando fuerte | `Ctrl+C` y relanzar con `--workers 2` |
| `salto largo ... retrocediendo` | La red de seguridad evitó saltarse un video | Nada, es lo correcto |
| `ERROR` repetido de un mismo trabajador | Ese trabajador se cayó | `Ctrl+C` y relanzar el mismo comando |

### Paso 5 — Revisar el avance cuando quieras

```bash
node -e "const s=require('./src/domains/ia/training/datasets/lsc54/rep0/state.json'); console.log('muestras:', s.workers.reduce((a,w)=>a+w.samples,0))"
```

### Paso 6 — Entregar los datos

Los datos quedan en `src/domains/ia/training/datasets/lsc54/rep0/`:
`worker-00.jsonl`, `worker-01.jsonl`, `worker-02.jsonl`, `worker-03.jsonl` y `state.json`.

**Mándalos todos, incluido `state.json`**: ahí está por dónde iba cada trabajador, y sin él
no se puede retomar ni saber qué falta.

```bash
# Windows (PowerShell)
Compress-Archive -Path src/domains/ia/training/datasets/lsc54/rep0 -DestinationPath rep0-slice2.zip

# Linux / macOS
cd src/domains/ia/training/datasets/lsc54 && tar -czf ~/rep0-slice2.tar.gz rep0
```

Pásalo por Drive o WeTransfer. **No lo subas a git**: esa carpeta está en `.gitignore` a
propósito, no versionamos datasets.

**Avisa apenas llegues a ~200 muestras, sin esperar a terminar.** Con eso ya se puede correr
la primera medición y saber si vamos bien encaminados. Después mandas el resto.

### Lo que NO hay que hacer

- **No cambies `--slice 2/2`.** Ese es tu tramo; el 1/2 ya lo está bajando la otra máquina.
- **No subas `--workers`.** Más conexiones no aceleran (el límite es por casa) y hacen que el
  servidor nos bloquee.
- **No borres la carpeta `rep0/`** ni `state.json`: ahí está todo lo bajado y el punto de
  retomada.
- **No subas archivos del dataset a git.**
- No hace falta que toques ningún código. Si ves algo raro, avisa antes de cambiarlo.

---

## 5. Qué sigue después (para que sepas hacia dónde va)

1. **Medir**: ya existe `npm run ia:measure-lsc54`. Usa una copia exacta del método de la app
   y responde, con datos, **cuáles señas se distinguen de verdad entre sí**. Cada muestra se
   prueba contra plantillas de **otras personas**, para no hacernos trampa.
2. **Elegir las 20 palabras** con ese resultado, no a dedo.
3. **Conversor** del dataset al formato de plantillas de la app.
4. **Probar una sola palabra frente a la cámara** antes de convertir las 20.
5. **Endpoints** en el backend para guardar y repartir las plantillas.

**Riesgo conocido:** puede que no haya 20 señas distinguibles con el motor actual. Si pasa,
las salidas son: menos palabras, o mejorar el motor para que tenga en cuenta el movimiento
(cambio grande, toca también el abecedario). Por eso medimos antes de programar el conversor.

---

## 6. Reglas de trabajo

- **Siempre en ramas**, nunca directo sobre `main` ni `develop`.
- Commits pequeños, con mensaje descriptivo. **Sin `Co-Authored-By` ni menciones a Claude.**
- **No versionar datasets, `.env` ni credenciales.**
- No borrar carpetas ni repos sin preguntar.
- Antes de escribir un conversor o un script sobre el dataset: **verificar el formato real**,
  no confiar en lo que dice la documentación. Ya nos pasó tres veces que no coincidía.

---

## 7. Texto para pegarle a tu Claude Code

```
Me sumo al proyecto Traduce Señas (app de Lengua de Señas Colombiana).
Estoy en el repo backendTS, rama feat/backend-dominios-ia.
Lee CONTEXTO_EQUIPO.md en la raíz del repo: ahí está todo el contexto y mi tarea
está detallada en la sección 4 ("Tu tarea: bajar la mitad del dataset").

Mi tarea es bajar EL TRAMO 2 DE 2 del dataset LSC-54. El tramo 1 lo está
bajando otra máquina, así que no lo toques.

Quiero que:
1. Verifiques Node 20+, que esté la rama correcta y las dependencias instaladas.
2. Lances en segundo plano, con el log a un archivo:
     npm run ia:download-lsc54 -- --slice 2/2 --workers 4 --max-samples 800
   Tarda entre 8 y 16 horas y es reanudable.
3. Me avises si aparecen HTTP 429 repetidos (ahí se relanza con --workers 2)
   o si algún trabajador se cae. Un 429 suelto es normal, el programa lo maneja.
4. Cuando el total llegue a ~200 muestras me avises, y corras
     npm run ia:measure-lsc54
   explicándome el resultado en español sencillo, sin jerga.
5. Cuando termine, me armes el comprimido de
   src/domains/ia/training/datasets/lsc54/rep0/ (incluyendo state.json)
   para mandarlo por Drive.

Reglas: trabajar en ramas, nunca sobre main ni develop; commits pequeños sin
Co-Authored-By ni menciones a Claude; nunca subir a git los archivos del
dataset (están en .gitignore); no borrar la carpeta rep0/ ni state.json.

Importante: el formato real del dataset NO coincide con lo que dice su
documentación (lo verificamos y nos falló tres veces). Antes de escribir
cualquier script que lo procese, comprueba el formato con los datos en la mano.
```
