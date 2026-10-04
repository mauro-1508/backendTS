import amqp, { Channel, ConsumeMessage } from 'amqplib';
import { EventBus, EventEnvelope, EventHandler, Subscription } from './event_bus';
import { makeEnvelope } from './make_envelope';

export const EVENTS_EXCHANGE = 'traduce.events';
const EXCHANGE_TYPE = 'topic';
const CONTENT_TYPE = 'application/json';

type Connection = Awaited<ReturnType<typeof amqp.connect>>;

/**
 * Adaptador RabbitMQ. Conecta de forma perezosa: un servicio arranca aunque el
 * broker aun no este arriba, y la conexion se reintenta en el siguiente uso.
 */
export class RabbitMqEventBus implements EventBus {
  private connection?: Connection;
  private channelPromise?: Promise<Channel>;

  constructor(private readonly url: string) {}

  async publish(type: string, payload: unknown): Promise<void> {
    const channel = await this.channel();
    const body = Buffer.from(JSON.stringify(makeEnvelope(type, payload)));
    channel.publish(EVENTS_EXCHANGE, type, body, { persistent: true, contentType: CONTENT_TYPE });
  }

  async subscribe({ queue, pattern }: Subscription, handler: EventHandler): Promise<void> {
    const channel = await this.channel();
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, EVENTS_EXCHANGE, pattern);
    await channel.consume(queue, message => {
      if (message) void this.dispatch(channel, message, handler);
    });
  }

  async close(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    this.channelPromise = undefined;
    await connection?.close();
  }

  private async dispatch(channel: Channel, message: ConsumeMessage, handler: EventHandler): Promise<void> {
    try {
      await handler(JSON.parse(message.content.toString()) as EventEnvelope);
      channel.ack(message);
    } catch (error) {
      console.error(`[events] fallo procesando ${message.fields.routingKey}`, error);
      // Sin reencolar: un mensaje venenoso no debe ciclar para siempre.
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
    const connection = await amqp.connect(this.url);
    connection.on('error', error => console.error('[events] conexion RabbitMQ', error));
    connection.on('close', () => {
      this.connection = undefined;
      this.channelPromise = undefined;
    });
    const channel = await connection.createChannel();
    await channel.assertExchange(EVENTS_EXCHANGE, EXCHANGE_TYPE, { durable: true });
    this.connection = connection;
    return channel;
  }
}
