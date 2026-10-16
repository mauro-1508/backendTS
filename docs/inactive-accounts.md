# Diagnóstico de cuentas inactivas

Revisión de código, sin consultar usuarios reales ni modificar estados:

- El registro crea INACTIVE antes de enviar el código. Si SMTP o emisión de
  código falla, conserva la cuenta y responde verification_email_sent=false.
- Login comprueba contraseña antes de devolver EMAIL_NOT_VERIFIED; BLOCKED usa
  su error separado. Google también rechaza una cuenta existente INACTIVE.
- Verificar correo requiere código vivo y contraseña; la transacción solo
  permite INACTIVE -> ACTIVE. BLOCKED no se activa por esa vía.
- El reset de contraseña con código válido ya puede verificar una cuenta
  INACTIVE según la política existente. Esta entrega no cambia ese control.
- La migración histórica 006 pudo dejar INACTIVE cuentas con correo inválido.
  No ejecutar esa migración ni activar cuentas para ocultar el reporte.
- Crear/reparar Profile no cambia IAM.status ni prueba que el correo esté verificado.

No hay caso concreto reproducible aportado para el reporte del equipo. Solicitar
endpoint, código HTTP/código de negocio, secuencia de registro/verificación y
entorno usando una cuenta ficticia. No pedir contraseñas, códigos vivos ni JWT.
Comprobar primero si el mensaje viene de IAM o si se está confundiendo un perfil
faltante con el estado de autenticación. Revisar indicadores de entrega de correo
sin imprimir direcciones ni configuración SMTP.

Las pruebas existentes email_verification.test.ts verifican escenarios de
registro, verificación, login y reenvío con dobles de repositorios/correo; no
prueban entrega SMTP ni el caso reportado. La reproducción corresponde a quien
reportó el problema con soporte del equipo IAM. No hay activación masiva ni
bypass implementado en esta entrega.
