import amqp, { Channel } from 'amqplib';
import { ClosableEventPublisher } from './event_publisher';
import { makeEnvelope } from './make_envelope';

export const EVENTS_EXCHANGE = 'traduce.events';
const EXCHANGE_TYPE = 'topic';
const CONTENT_TYPE = 'application/json';

type Connection = Awaited<ReturnType<typeof amqp.connect>>;

/**
 * Publicador RabbitMQ en el exchange topic `traduce.events`. Conecta de forma
 * perezosa (el servicio arranca aunque el broker aun no este arriba) y, si la
 * conexion se cae, la siguiente publicacion vuelve a conectar.
 */
export class RabbitMqEventPublisher implements ClosableEventPublisher {
  private connection?: Connection;
  private channelPromise?: Promise<Channel>;

  constructor(
    private readonly url: string,
    private readonly connect: (url: string) => Promise<Connection> = (target) => amqp.connect(target),
  ) {}

  async publish(type: string, payload: unknown): Promise<void> {
    const channel = await this.channel();
    const body = Buffer.from(JSON.stringify(makeEnvelope(type, payload)));
    channel.publish(EVENTS_EXCHANGE, type, body, { persistent: true, contentType: CONTENT_TYPE });
  }

  async close(): Promise<void> {
    const connection = this.connection;
    this.reset();
    await connection?.close().catch(() => undefined);
  }

  private channel(): Promise<Channel> {
    this.channelPromise ??= this.open().catch((error) => {
      this.channelPromise = undefined;
      throw error;
    });
    return this.channelPromise;
  }

  private async open(): Promise<Channel> {
    const connection = await this.connect(this.url);
    connection.on('error', (error) => console.error('[events] conexion RabbitMQ', error));
    connection.on('close', () => {
      if (this.connection === connection) this.reset();
    });
    try {
      const channel = await connection.createChannel();
      channel.on('error', (error) => console.error('[events] canal RabbitMQ', error));
      await channel.assertExchange(EVENTS_EXCHANGE, EXCHANGE_TYPE, { durable: true });
      this.connection = connection;
      return channel;
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  private reset(): void {
    this.connection = undefined;
    this.channelPromise = undefined;
  }
}
