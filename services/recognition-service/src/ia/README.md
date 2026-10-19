# Módulo `ia` (plantillas de señas)

Importa, lista y borra las plantillas que el motor del cliente compara con DTW/KNN. Visión general del servicio: [../../README.md](../../README.md).

| Carpeta o archivo | Contenido |
|---|---|
| `domain/entity.ts` | `SignTemplate`, `NewSignTemplate` y `TEMPLATE_KINDS` (`static`, `motion`) |
| `domain/service.ts` | `signTemplateDomainService.ensureIsValid`: valida etiqueta, `kind`, número de frames y dimensión de cada frame (`InvalidSignTemplateError`) |
| `domain/motion_template.ts` | Copia del motor de movimiento del frontend: normalización de landmarks, remuestreo a 16 frames, DTW y confianza. Constantes `MAX_GESTURE_DISTANCE` (4.0) y `MIN_WORD_CONFIDENCE` (0.7). Tipo `GestureTemplate` |
| `application/` | `makeImportSignTemplates`, `makeListSignTemplates`, `makeDeleteSignTemplate` |
| `ports/inbound/sign_template_service.ts` | Interfaz del servicio: `importMany`, `list`, `remove` |
| `ports/outbound/sign_template_repository.ts` | Interfaz del repositorio: `createMany`, `list`, `remove` |
| `adapters/inbound/http/` | `routes.ts` (permisos por ruta), `sign_template_controller.ts` y `dto/import_templates_request.ts` |
| `adapters/inbound/events/lexicon_events_subscriber.ts` | Suscriptor de `lexicon.*`. Hoy solo registra en el log |
| `adapters/outbound/postgres/sign_template_repository.ts` | Tabla `sign_templates`; inserta el lote con una sola sentencia (`UNNEST`) |

## Formatos de plantilla

| `kind` | Frames | Valores por frame | Uso |
|---|---|---|---|
| `static` | 1 | 63 (una mano) | Abecedario |
| `motion` | 16 | 126 (dos manos) | Palabras |

El endpoint de importación acepta dos cuerpos: `{ gestures: [{ label, frames }], kind?, source? }`, que es el formato que exporta la app y produce el conversor del dataset, y `{ templates: [{ label, kind, features, source? }] }`.

Las dimensiones viven en `src/common/domain/landmarks.ts` (`SEQ_LEN`, `STATIC_DIM`, `MOTION_DIM`). `motion_template.ts` las usa y define además `HAND_DIM` y `FRAME_DIM` localmente.

## Mantenimiento

`motion_template.ts` debe coincidir con el motor del frontend (`motionTemplateStore.ts`, `motionClassifier.ts`, `normalize.ts`, según indica su cabecera). Si una de las dos partes cambia y la otra no, las plantillas normalizadas de forma distinta dejan de reconocerse en la app.

Conversión de datasets: [../../training/README.md](../../training/README.md).
