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

### Pasos

```bash
git clone https://github.com/mauro-1508/backendTS.git
cd backendTS
git switch feat/backend-dominios-ia
npm install
```

Necesitas **Node 20 o superior** (`node -v`). No necesitas base de datos ni `.env` para esto.

**Tu tramo es el 2 de 2** (el otro lo está bajando la otra máquina):

```bash
npm run ia:download-lsc54 -- --slice 2/2 --workers 4 --max-samples 800
```

Déjalo corriendo. Tarda **varias horas**. Si lo cortas, se retoma con el mismo comando.
Verás líneas así, una por muestra:

```
16:05:12 [w00] Signer_12/Colores/rojo/vid_3 96 frames, 9.4 MB | total 37
```

### Qué mirar mientras corre

- **`total` sube** → todo bien.
- **`ERROR HTTP 429`** → el servidor está limitando. El programa ya espera y reintenta solo.
  Si sale muy seguido, baja a `--workers 2`.
- **`salto largo ... retrocediendo`** → normal y esperado, es la red de seguridad que evita
  saltarse videos.
- Si un trabajador se queda mucho rato sin producir nada al principio, es normal: arranca a
  mitad de una grabación y tiene que avanzar hasta la primera frontera.

### Qué entregar

Los datos quedan en `src/domains/ia/training/datasets/lsc54/rep0/`:
`worker-00.jsonl`, `worker-01.jsonl`, … y `state.json`.

**No los subas a git**: esa carpeta está en `.gitignore` a propósito (no versionamos datasets).
Comprímela y pásala por Drive o WeTransfer:

```bash
cd src/domains/ia/training/datasets/lsc54
tar -czf rep0-slice2.tar.gz rep0
```

Avisa cuando lleves un rato, aunque no hayas terminado: **los datos parciales ya sirven** para
empezar a medir.

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
Lee CONTEXTO_EQUIPO.md en la raíz de este repo: ahí está todo el contexto.

Mi tarea concreta es bajar el tramo 2 de 2 del dataset LSC-54 con:
  npm run ia:download-lsc54 -- --slice 2/2 --workers 4 --max-samples 800

Quiero que:
1. Verifiques que tengo Node 20+ y las dependencias instaladas.
2. Lances esa descarga en segundo plano y me avises si aparecen errores
   repetidos de HTTP 429 o si algún trabajador se cae.
3. Cuando haya al menos 200 muestras, corras npm run ia:measure-lsc54
   y me expliques el resultado en español sencillo.

Reglas: trabajar en ramas, commits sin menciones a Claude ni Co-Authored-By,
y nunca subir a git los archivos del dataset (están en .gitignore).

Importante: el formato real del dataset no coincide con lo que dice su
documentación. Antes de escribir cualquier script que lo procese, verifica
el formato con los datos en la mano.
```
