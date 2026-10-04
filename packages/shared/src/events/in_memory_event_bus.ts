import { EventBus, EventHandler, Subscription } from './event_bus';
import { makeEnvelope } from './make_envelope';
import { matchesTopic } from './topic_matcher';

/** Bus en proceso: para tests y para desarrollo sin RabbitMQ (RABBITMQ_URL vacio). */
export class InMemoryEventBus implements EventBus {
  private readonly subscriptions: Array<{ subscription: Subscription; handler: EventHandler }> = [];

  async publish(type: string, payload: unknown): Promise<void> {
    const event = makeEnvelope(type, payload);
    const targets = this.subscriptions.filter(s => matchesTopic(s.subscription.pattern, type));
    for (const { handler } of targets) {
      await handler(event);
    }
  }

  async subscribe(subscription: Subscription, handler: EventHandler): Promise<void> {
    this.subscriptions.push({ subscription, handler });
  }

  async close(): Promise<void> {
    this.subscriptions.length = 0;
  }
}
