import { Logger } from '../ports/logger';
import { Mailer } from '../ports/mailer';
import { EmailOutbox, EmailOutcome, PendingEmail } from '../ports/repositories';

const BATCH_SIZE = 20;

/**
 * Envia los avisos EMAIL cuya hora programada ya paso. Sin correo o con el interruptor apagado se
 * cancelan (INV-025); si el SMTP falla quedan FAILED, distinto de PENDING (FR-505).
 */
export const makeDeliverEmailNotifications = (deps: { outbox: EmailOutbox; mailer: Mailer; logger: Logger }) => {
  const deliver = async (email: PendingEmail): Promise<EmailOutcome> => {
    if (!email.to || !email.notificationsEnabled) return 'CANCELLED';
    try {
      await deps.mailer.sendNotification({
        to: email.to, title: email.title, body: email.body, language: email.language,
      });
      return 'SENT';
    } catch (error) {
      // Solo el nombre: el mensaje del SMTP puede traer datos de la cuenta.
      deps.logger.error(`[profile] no se pudo enviar el correo ${email.notificationId}`, (error as Error)?.name ?? 'error');
      return 'FAILED';
    }
  };

  return (): Promise<number> => deps.outbox.processDue(BATCH_SIZE, deliver);
};
