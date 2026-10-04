# Entrenamiento (conversión de datasets)

Scripts en TypeScript que convierten datasets públicos de landmarks al formato de
plantillas que lee el motor del frontend (`motionTemplateStore.ts`).

| Carpeta | Qué va | ¿Se versiona? |
|---|---|---|
| `datasets/` | Datos crudos descargados (p. ej. `datasets/lsc54/`) | **No** (`.gitignore`) |
| `converters/` | Conversores dataset → plantillas | Sí |
| `output/` | JSON convertido, listo para importar | **No** (`.gitignore`) |

El formato real de cada dataset se documenta aquí antes de escribir su conversor.

## LSC-54

Dataset público de LSC (CC BY-NC 4.0, citar: Mora-Zarate et al., *Data in Brief*, 2025,
https://doi.org/10.1016/j.dib.2025.112145). Formato real y encaje con el motor documentados en
`docs/06-data/datasets/lsc54.md` (repo trans-sl-docs).

```
npm run ia:inspect-lsc54                     # usa datasets/lsc54/sample.json
npm run ia:inspect-lsc54 -- ruta.json --limit 100
```

Lo esencial antes de convertir:

- Ruta: `Signer_n / categoría / seña / vid_n / rep_n / frame_n / {r_hand, l_hand, face, pose}`,
  coordenadas por columna (`{x: [], y: [], z: []}`).
- `rep_n` son copias trasladadas en x del mismo video: tras `normalize.ts` son idénticas. Usar solo `rep_0`.
- Longitud variable (~45 frames a 30 FPS), sin alinear en el tiempo.
- Manos con solo 4 puntos distintos = relleno copiado de la pose: descartar esos frames.
- `face` viene en `null` cuando no se detectó.
