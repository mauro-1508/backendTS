import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeDeliverEmailNotifications } from '../src/application/deliver_email_notifications';
import { notificationEmail } from '../src/adapters/outbound/mailer/notification_email_template';
import { NotificationEmail } from '../src/ports/mailer';
import { EmailOutbox, EmailOutcome, PendingEmail } from '../src/ports/repositories';

const pending = (over: Partial<PendingEmail> = {}): PendingEmail => ({
  notificationId: 'n1',
  to: 'admin@example.com',
  title: 'Resumen semanal',
  body: 'Linea 1\nLinea 2',
  language: 'ES',
  notificationsEnabled: true,
  ...over,
});

const setup = (emails: PendingEmail[], failFor = new Set<string>()) => {
  const sent: NotificationEmail[] = [];
  const outcomes: Record<string, EmailOutcome> = {};
  const errors: string[] = [];
  const outbox: EmailOutbox = {
    processDue: async (limit, deliver) => {
      const batch = emails.slice(0, limit);
      for (const email of batch) outcomes[email.notificationId] = await deliver(email);
      return batch.length;
    },
  };
  const run = makeDeliverEmailNotifications({
    outbox,
    mailer: {
      sendNotification: async email => {
        if (failFor.has(email.to)) throw new Error('smtp caido');
        sent.push(email);
      },
    },
    logger: { error: message => { errors.push(message); } },
  });
  return { run, sent, outcomes, errors };
};

describe('deliver_email_notifications', () => {
  it('envia el aviso con titulo, cuerpo e idioma y lo marca SENT', async () => {
    const { run, sent, outcomes } = setup([pending({ language: 'EN' })]);
    assert.equal(await run(), 1);
    assert.deepEqual(sent, [{ to: 'admin@example.com', title: 'Resumen semanal', body: 'Linea 1\nLinea 2', language: 'EN' }]);
    assert.equal(outcomes.n1, 'SENT');
  });

  it('cancela sin enviar si no hay correo o el interruptor esta apagado', async () => {
    const { run, sent, outcomes } = setup([
      pending({ notificationId: 'sin-correo', to: undefined }),
      pending({ notificationId: 'apagado', notificationsEnabled: false }),
    ]);
    await run();
    assert.equal(sent.length, 0);
    assert.deepEqual(outcomes, { 'sin-correo': 'CANCELLED', apagado: 'CANCELLED' });
  });

  it('si el SMTP falla marca FAILED, registra el error y sigue con los demas', async () => {
    const { run, sent, outcomes, errors } = setup(
      [pending({ notificationId: 'a', to: 'malo@example.com' }), pending({ notificationId: 'b' })],
      new Set(['malo@example.com']),
    );
    await run();
    assert.deepEqual(outcomes, { a: 'FAILED', b: 'SENT' });
    assert.equal(sent.length, 1);
    assert.equal(errors.length, 1);
    assert.doesNotMatch(errors[0], /smtp caido/);
  });

  it('procesa como maximo un lote de 20 por vuelta', async () => {
    const emails = Array.from({ length: 25 }, (_, i) => pending({ notificationId: `n${i}` }));
    const { run } = setup(emails);
    assert.equal(await run(), 20);
  });
});

describe('notification_email_template', () => {
  it('incluye el boton que abre la app y el asunto con la marca', () => {
    const { subject, html } = notificationEmail({
      title: 'Resumen semanal', body: 'Hola', language: 'ES', appUrl: 'https://traducesenas.tech',
    });
    assert.equal(subject, 'Resumen semanal - TraduceSeñas');
    assert.match(html, /<a href="https:\/\/traducesenas\.tech"/);
    assert.match(html, /Abrir TraduceSeñas/);
  });

  it('usa el texto del boton en ingles y escapa el contenido', () => {
    const { html } = notificationEmail({
      title: '<b>x</b>', body: 'a & b\n<script>', language: 'EN', appUrl: 'https://traducesenas.tech',
    });
    assert.match(html, /Open TraduceSeñas/);
    assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
    assert.match(html, /<p[^>]*>a &amp; b<\/p><p[^>]*>&lt;script&gt;<\/p>/);
    assert.doesNotMatch(html, /<script>/);
  });
});
