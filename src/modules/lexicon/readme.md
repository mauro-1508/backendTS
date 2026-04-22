# módulo lexicon — Léxico LSC

Módulo pendiente de implementación. Provee el catálogo de señas de la Lengua de Señas Colombiana (LSC).

## Estado

**No implementado.** La carpeta existe como placeholder.

## Rutas planificadas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/lexicon` | Lista entradas del léxico (paginado) |
| `GET` | `/api/lexicon/search?q=` | Búsqueda por palabra o letra |

## Archivos a crear

- `lexicon.routes.js`
- `lexicon.controller.js`
- `lexicon.service.js`
- `lexicon.repository.js`

## Frontend actual

`AlphabetScreen.tsx` muestra el alfabeto A-Z con imágenes estáticas. No consume este endpoint aún.
