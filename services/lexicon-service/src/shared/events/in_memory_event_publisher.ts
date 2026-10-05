import { ClosableEventPublisher, EventEnvelope } from './event_publisher';
import { makeEnvelope } from './make_envelope';

/** Para tests y desarrollo sin RabbitMQ (RABBITMQ_URL vacio): guarda lo publicado. */
export class InMemoryEventPublisher implements ClosableEventPublisher {
  readonly published: EventEnvelope[] = [];

  async publish(type: string, payload: unknown): Promise<void> {
    this.published.push(makeEnvelope(type, payload));
  }

  async close(): Promise<void> {
    this.published.length = 0;
  }
}
