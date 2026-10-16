# Recuperación de perfiles y preferencias faltantes

## Objetivo

Recuperar los datos mínimos de Profile para cuentas existentes en IAM
cuyo perfil o preferencias no se crearon correctamente.

La recuperación inserta únicamente las filas faltantes. Conserva los
perfiles y preferencias existentes.

No activa cuentas, cambia contraseñas, asigna roles ni reconstruye
traducciones, logros o notificaciones.

## Componentes

- `services/iam-service/cmd/export_identities.ts`:
  exporta identidades desde IAM.
- `services/profile-service/cmd/import_identities.ts`:
  valida el archivo y, en modo de aplicación, solicita la recuperación.
- `services/profile-service/src/application/import_identity_recovery.ts`:
  valida el documento completo y procesa las identidades.
- `services/profile-service/src/application/recover_user_profile.ts`:
  recupera una identidad dentro de una transacción.
- `packages/shared/src/recovery/`:
  define el formato y las utilidades de los comandos.

La recuperación es independiente de la deduplicación de eventos de
registro. No necesita republicar `iam.UserRegistered`.

## Información exportada

Cada identidad contiene exclusivamente:

- `userId`.
- `email`.
- `name`, cuando corresponda; puede ser null.

No se exportan contraseñas, tokens ni roles.

El documento incluye formato, versión, origen, fecha de exportación y
estados seleccionados.

## Selección de cuentas

Los estados admitidos son `ACTIVE`, `INACTIVE` y `BLOCKED`.

El operador debe indicar explícitamente cuáles exportar mediante
`--statuses`. La elección debe acordarse con el equipo.

Recuperar el perfil de una cuenta INACTIVE o BLOCKED no cambia su estado
en IAM ni le concede acceso.

## Configuración de conexión

El exportador requiere:

- `IAM_DB_HOST`
- `IAM_DB_PORT`
- `IAM_DB_USER`
- `IAM_DB_PASSWORD`
- `IAM_DB_NAME`

El importador, únicamente en modo de aplicación, requiere:

- `PROFILE_DB_HOST`
- `PROFILE_DB_PORT`
- `PROFILE_DB_USER`
- `PROFILE_DB_PASSWORD`
- `PROFILE_DB_NAME`

Los comandos requieren configuración explícita. No cargan
automáticamente archivos `.env`.

Las credenciales deben proporcionarse mediante el mecanismo aprobado
para el entorno. No deben guardarse en este documento ni en Git.

## Condiciones antes de aplicar

1. Acordar el entorno, los estados y las personas responsables.
2. Verificar que ambas conexiones pertenecen al entorno seleccionado.
3. Garantizar una ventana sin eliminaciones de cuentas desde antes de
   exportar hasta terminar la aplicación y sus posibles reintentos.
4. Guardar y transferir el archivo mediante un medio protegido.
5. Validar el archivo completo antes de aplicarlo.

La opción `--confirm-window=yes` registra la confirmación del operador:
no bloquea las eliminaciones por sí misma.

Si no puede garantizarse esa ventana, no debe ejecutarse la aplicación.
Una cuenta eliminada después de exportar podría recuperar una proyección
obsoleta en Profile.

## Exportación

El exportador utiliza una transacción de solo lectura con aislamiento
REPEATABLE READ y paginación ordenada por identificador.

El archivo de destino no debe existir. El comando no lo sobrescribe.
El archivo nuevo se crea con permisos 0600.

Opciones:

- `--output`: ruta del archivo.
- `--source`: etiqueta acordada del entorno.
- `--statuses`: estados separados por comas.

La etiqueta de origen ayuda a detectar mezclas de archivos, pero no
autentica al productor.

## Validación

El modo `validate` comprueba el documento completo sin abrir una
conexión a la base de Profile.

Opciones:

- `--input`: ruta del archivo.
- `--source`: origen esperado.
- `--mode=validate`.

Se rechazan documentos con:

- Formato, versión u origen incorrectos.
- Campos desconocidos.
- Identidades inválidas, duplicadas o desordenadas.
- Estados vacíos, desconocidos o duplicados.
- JSON o UTF-8 inválidos.
- Fechas inválidas, futuras o con más de una hora de antigüedad.
- Más de 100 000 identidades o más de 64 MiB.

La validación informa la cantidad de cuentas y el SHA-256 del archivo.
El hash verifica los bytes seleccionados; no acredita su procedencia.

## Aplicación

Opciones:

- `--input`: ruta del archivo validado.
- `--source`: origen esperado.
- `--mode=apply`.
- `--sha256`: hash exacto obtenido durante la validación.
- `--confirm-window=yes`.

El comando vuelve a validar el archivo y comprueba su hash antes de
abrir la conexión a Profile.

Cada identidad se procesa en su propia transacción. Si falla una
identidad, el procesamiento se detiene y las transacciones anteriores
permanecen confirmadas.

El contador de identidades confirmadas no representa necesariamente
filas nuevas: una identidad ya existente también puede procesarse sin
crear filas.

## Reintentos y códigos de salida

- `0`: validación o aplicación completada.
- `1`: error de configuración, lectura, validación u otro fallo general.
- `2`: aplicación parcial interrumpida.

Tras una aplicación parcial puede repetirse el archivo completo,
siempre que siga vigente y se mantenga la ventana sin eliminaciones.

No se deben saltar registros basándose únicamente en el contador.
La recuperación conserva lo existente y permite repetir identidades.

Si el archivo vence, debe obtenerse una nueva exportación bajo las
mismas condiciones operativas.

## Protección y conservación del archivo

El archivo contiene datos personales.

Debe almacenarse con acceso restringido, transferirse por un medio
protegido y eliminarse conforme a la política acordada por el equipo.
No debe añadirse al repositorio.

Los comandos informan resultados y contadores sin imprimir las
identidades ni las credenciales.

## Validaciones realizadas durante el desarrollo

- Compilación de todos los workspaces del backend.
- Ocho pruebas de validación y aplicación del importador con dobles.
- Cuatro pruebas del exportador con conexión simulada.
- Pruebas previas del caso de uso de recuperación sobre PostgreSQL
  de pruebas, incluidos estados parciales y rollback.

Las pruebas del exportador con conexión simulada no demuestran por sí
solas el comportamiento de una exportación real sobre IAM.

Estos resultados no significan que se haya ejecutado una recuperación
sobre cuentas reales.

## Límites

Esta herramienta repara ausencias existentes; no evita la pérdida de
futuros eventos de registro.

La entrega durable de eventos, la eliminación coordinada entre
servicios y el diagnóstico de cuentas inactivas requieren trabajo
separado.