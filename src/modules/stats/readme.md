# módulo stats — Estadísticas

Módulo pendiente de implementación. Devuelve datos de uso del usuario para los gráficos del dashboard.

## Estado

**No implementado.** La carpeta existe como placeholder.

## Rutas planificadas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/stats` | KPIs y datos agregados del usuario autenticado |
| `GET` | `/api/stats/weekly` | Actividad de los últimos 7 días |
| `GET` | `/api/stats/monthly` | Crecimiento mensual |

## Archivos a crear

- `stats.routes.js`
- `stats.controller.js`
- `stats.service.js`
- `stats.repository.js`

## Frontend actual

`StatsScreen.tsx` usa constantes mock (`WEEKLY_DATA`, `MONTHLY_LINE`, `SECTION_PIE`, `KPI_CARDS`) con `// TODO: Conectar con ENDPOINTS.stats`.
