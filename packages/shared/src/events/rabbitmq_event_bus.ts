import amqp, { Channel, ConsumeMessage } from 'amqplib';
import { exponentialBackoffMs } from './backoff';
import { EventBus, EventEnvelope, EventHandler, Subscription } from './event_bus';
import { makeEnvelope } from './make_envelope';

export const EVENTS_EXCHANGE = 'traduce.events';
/** Los mensajes rechazados de cualquier cola llegan aqui y se guardan en `<cola>.dead`. */
export const DEAD_LETTER_EXCHANGE = 'traduce.events.dead';
export const DEAD_LETTER_QUEUE_SUFFIX = '.dead';
export const DEFAULT_PREFETCH = 10;

const EXCHANGE_TYPE = 'topic';
const DEAD_LETTER_EXCHANGE_TYPE = 'direct';
const CONTENT_TYPE = 'application/json';

type Connection = Awaited<ReturnType<typeof amqp.connect>>;

export interface RabbitMqOptions {
  /** Mensajes sin confirmar que cada consumidor admite a la vez. */
  prefetch?: number;
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
  private channelPromise?: Promise<Channel>;
  private readonly subscriptions = new Map<string, RegisteredSubscription>();
  private readonly prefetch: number;
  private readonly reconnectDelayMs: (attempt: number) => number;
  private readonly connectFn: (url: string) => Promise<Connection>;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempt = 0;
  private closing = false;

  constructor(private readonly url: string, options: RabbitMqOptions = {}) {
    this.prefetch = options.prefetch ?? DEFAULT_PREFETCH;
    this.reconnectDelayMs = options.reconnectDelayMs ?? (attempt => exponentialBackoffMs(attempt));
    this.connectFn = options.connect ?? (url => amqp.connect(url));
  }

  async publish(type: string, payload: unknown): Promise<void> {
    const channel = await this.channel();
    const body = Buffer.from(JSON.stringify(makeEnvelope(type, payload)));
    channel.publish(EVENTS_EXCHANGE, type, body, { persistent: true, contentType: CONTENT_TYPE });
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
      if (message) void this.dispatch(channel, message, handler);
    });
  }

  private async dispatch(channel: Channel, message: ConsumeMessage, handler: EventHandler): Promise<void> {
    try {
      await handler(JSON.parse(message.content.toString()) as EventEnvelope);
      channel.ack(message);
    } catch (error) {
      console.error(`[events] fallo procesando ${message.fields.routingKey}; va a la cola de mensajes muertos`, error);
      // Sin reencolar (un mensaje venenoso no debe ciclar): el DLX lo guarda en `<cola>.dead`.
      channel.nack(message, false, false);
    }
  }

  private channel(): Promise<Channel> {
    this.channelPromise ??= this.openChannel().catch(error => {
      this.channelPromise = undefined;
      throw error;
    });
    return this.channelPromise;
  }

  private async openChannel(): Promise<Channel> {
    const connection = await this.connectFn(this.url);
    connection.on('error', error => console.error('[events] conexion RabbitMQ', error));
    connection.on('close', () => this.onConnectionLost(connection));
    try {
      const channel = await connection.createChannel();
      channel.on('error', error => console.error('[events] canal RabbitMQ', error));
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
