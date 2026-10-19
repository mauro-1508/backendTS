/**
 * Sin RABBITMQ_URL el bus es en memoria y no entrega a nadie: marcar el outbox como publicado
 * perderia el evento. En produccion eso es un error de configuracion (se aborta el arranque);
 * en desarrollo el relay simplemente no corre y los eventos quedan pendientes.
 */
export const outboxRelayMode = (env: { rabbitmqUrl: string; nodeEnv?: string }): 'run' | 'skip' => {
  if (env.rabbitmqUrl) return 'run';
  if (env.nodeEnv === 'production') {
    throw new Error('IAM_RABBITMQ_URL (o RABBITMQ_URL) es obligatorio en produccion: sin broker no se pueden publicar los eventos del outbox');
  }
  return 'skip';
};
