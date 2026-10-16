import amqp, { Channel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import { exponentialBackoffMs } from './backoff';
import { EventBus, EventEnvelope, EventHandler, PublishOptions, Subscription } from './event_bus';
import { makeEnvelope } from './make_envelope';

export const EVENTS_EXCHANGE = 'traduce.events';
/** Los mensajes rechazados de cualquier cola llegan aqui y se guardan en `<cola>.dead`. */
export const DEAD_LETTER_EXCHANGE = 'traduce.events.dead';
export const DEAD_LETTER_QUEUE_SUFFIX = '.dead';
/** El broker no confirmo el mensaje a tiempo (no se sabe si llego). */
export class PublishTimeoutError extends Error {}
/** El mensaje era mandatory y ninguna cola lo recibio. */
export class UnroutableEventError extends Error {}

export const DEFAULT_PREFETCH = 10;
/** Espera maxima (ms) a la confirmacion del broker al publicar. */
export const DEFAULT_CONFIRM_TIMEOUT_MS = 10_000;

const EXCHANGE_TYPE = 'topic';
const DEAD_LETTER_EXCHANGE_TYPE = 'direct';
const CONTENT_TYPE = 'application/json';

type Connection = Awaited<ReturnType<typeof amqp.connect>>;

export interface RabbitMqOptions {
  /** Mensajes sin confirmar que cada consumidor admite a la vez. */
  prefetch?: number;
  /** Espera maxima (ms) a la confirmacion del broker al publicar. */
  confirmTimeoutMs?: number;
  /** Espera (ms) antes del intento de reconexion numero `attempt`. */
  reconnectDelayMs?: (attempt: number) => number;
  /** Para pruebas: sustituye a `amqp.connect`. */
  connect?: (url: string) => Promise<Connection>;
}

interface RegisteredSubscription {
  subscription: Subscription;
  handler: EventHandler;
}

/**
 * Adaptador RabbitMQ. Conecta de forma perezosa: un servicio arranca aunque el broker aun
 * no este arriba. Recuerda sus suscripciones y, si la conexion se cae, reconecta con backoff
 * exponencial y las vuelve a registrar. Los mensajes que el handler rechaza van a la cola de
 * mensajes muertos de su cola en vez de descartarse.
 */
export class RabbitMqEventBus implements EventBus {
  private connection?: Connection;
  private channelPromise?: Promise<ConfirmChannel>;
  private readonly subscriptions = new Map<string, RegisteredSubscription>();
  private readonly prefetch: number;
  private readonly confirmTimeoutMs: number;
  private readonly reconnectDelayMs: (attempt: number) => number;
  private readonly connectFn: (url: string) => Promise<Connection>;
  /** messageId (= eventId) de los mensajes mandatory que el broker devolvio por no tener ruta. */
  private readonly returned = new Set<string>();
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempt = 0;
  private closing = false;

  constructor(private readonly url: string, options: RabbitMqOptions = {}) {
    this.prefetch = options.prefetch ?? DEFAULT_PREFETCH;
    this.confirmTimeoutMs = options.confirmTimeoutMs ?? DEFAULT_CONFIRM_TIMEOUT_MS;
    this.reconnectDelayMs = options.reconnectDelayMs ?? (attempt => exponentialBackoffMs(attempt));
    this.connectFn = options.connect ?? (url => amqp.connect(url));
  }

  /** Resuelve solo cuando el broker confirma el mensaje; si lo rechaza o se cae, rechaza. */
  async publish(type: string, payload: unknown, options: PublishOptions = {}): Promise<void> {
    const channel = await this.channel();
    const envelope = makeEnvelope(type, payload, options.eventId);
    const body = Buffer.from(JSON.stringify(envelope));
    const mandatory = options.mandatory === true;
    channel.publish(EVENTS_EXCHANGE, type, body, {
      persistent: true, contentType: CONTENT_TYPE, messageId: envelope.eventId, mandatory,
    });
    try {
      await this.withTimeout(channel.waitForConfirms(), type);
      // basic.return llega ANTES que el ack del mismo mensaje: aqui ya sabemos si no tenia ruta.
      if (mandatory && this.returned.has(envelope.eventId)) {
        throw new UnroutableEventError('ninguna cola recibio ' + type + ' (' + envelope.eventId + ')');
      }
    } finally {
      this.returned.delete(envelope.eventId);
    }
  }

  /** Sin timeout, un broker mudo dejaria colgado al llamador (p. ej. el relay con su transaccion abierta). */
  private withTimeout(confirmation: Promise<void>, type: string): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new PublishTimeoutError('el broker no confirmo ' + type + ' en ' + this.confirmTimeoutMs + ' ms')),
        this.confirmTimeoutMs,
      );
    });
    return Promise.race([confirmation, timeout]).finally(() => clearTimeout(timer));
  }

  async subscribe(subscription: Subscription, handler: EventHandler): Promise<void> {
    const registered = { subscription, handler };
    await this.consume(await this.channel(), registered);
    this.subscriptions.set(subscription.queue, registered);
  }

  async close(): Promise<void> {
    this.closing = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const connection = this.connection;
    this.connection = undefined;
    this.channelPromise = undefined;
    await connection?.close();
  }

  private async consume(channel: Channel, { subscription, handler }: RegisteredSubscription): Promise<void> {
    const { queue, pattern } = subscription;
    const deadQueue = `${queue}${DEAD_LETTER_QUEUE_SUFFIX}`;
    await channel.assertQueue(deadQueue, { durable: true });
    await channel.bindQueue(deadQueue, DEAD_LETTER_EXCHANGE, queue);
    await channel.assertQueue(queue, {
      durable: true,
      deadLetterExchange: DEAD_LETTER_EXCHANGE,
      deadLetterRoutingKey: queue,
    });
    await channel.bindQueue(queue, EVENTS_EXCHANGE, pattern);
    await channel.consume(queue, message => {
      if (message) {
        this.dispatch(channel, message, handler).catch(error => console.error('[events] fallo en dispatch', error));
      }
    });
  }

  private async dispatch(channel: Channel, message: ConsumeMessage, handler: EventHandler): Promise<void> {
    try {
      await handler(JSON.parse(message.content.toString()) as EventEnvelope);
    } catch (error) {
      console.error(`[events] fallo procesando ${message.fields.routingKey}; va a la cola de mensajes muertos`, error);
      // Sin reencolar (un mensaje venenoso no debe ciclar): el DLX lo guarda en `<cola>.dead`.
      this.settle(() => channel.nack(message, false, false), message);
      return;
    }
    this.settle(() => channel.ack(message), message);
  }

  /** ack/nack lanzan si el canal ya se cerro; el broker reentregara el mensaje, no hay que tumbar el proceso. */
  private settle(action: () => void, message: ConsumeMessage): void {
    try {
      action();
    } catch (error) {
      console.error(`[events] no se pudo confirmar ${message.fields.routingKey} (canal cerrado)`, error);
    }
  }

  private channel(): Promise<ConfirmChannel> {
    if (this.closing) return Promise.reject(new Error('el bus de eventos esta cerrado'));
    this.channelPromise ??= this.openChannel().catch(error => {
      this.channelPromise = undefined;
      throw error;
    });
    return this.channelPromise;
  }

  private async openChannel(): Promise<ConfirmChannel> {
    const connection = await this.connectFn(this.url);
    connection.on('error', error => console.error('[events] conexion RabbitMQ', error));
    connection.on('close', () => this.onConnectionLost(connection));
    try {
      const channel = await connection.createConfirmChannel();
      channel.on('error', error => console.error('[events] canal RabbitMQ', error));
      channel.on('return', message => {
        const id = message?.properties?.messageId;
        if (typeof id === 'string') this.returned.add(id);
      });
      // Un canal cerrado deja a los consumidores huerfanos: se reabre todo desde la conexion.
      channel.on('close', () => void connection.close().catch(() => undefined));
      await channel.prefetch(this.prefetch);
      await channel.assertExchange(EVENTS_EXCHANGE, EXCHANGE_TYPE, { durable: true });
      await channel.assertExchange(DEAD_LETTER_EXCHANGE, DEAD_LETTER_EXCHANGE_TYPE, { durable: true });
      this.connection = connection;
      return channel;
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  private onConnectionLost(connection: Connection): void {
    if (this.connection !== connection) return;
    this.connection = undefined;
    this.channelPromise = undefined;
    if (!this.closing && this.subscriptions.size > 0) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.reconnectDelayMs(this.reconnectAttempt++);
    console.warn(`[events] conexion RabbitMQ perdida; reconectando en ${delay} ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.reconnect();
    }, delay);
    this.reconnectTimer.unref();
  }

  private async reconnect(): Promise<void> {
    if (this.closing) return;
    try {
      const channel = await this.channel();
      for (const registered of this.subscriptions.values()) await this.consume(channel, registered);
      this.reconnectAttempt = 0;
      console.log(`[events] RabbitMQ reconectado; ${this.subscriptions.size} suscripcion(es) restaurada(s)`);
    } catch (error) {
      console.error('[events] fallo al reconectar con RabbitMQ', error);
      // Si la conexion quedo abierta a medias, cerrarla vuelve a disparar la reconexion limpia.
      const connection = this.connection;
      if (connection) await connection.close().catch(() => undefined);
      else this.scheduleReconnect();
    }
  }
}
