import { EventBus, EventHandler, PublishOptions, Subscription } from './event_bus';
import { DeadLetterInspector } from './dead_letter_check';
import { makeEnvelope } from './make_envelope';
import { matchesTopic } from './topic_matcher';

/** Bus en proceso: para tests y para desarrollo sin RabbitMQ (RABBITMQ_URL vacio). */
export class InMemoryEventBus implements EventBus, DeadLetterInspector {
  private readonly subscriptions: Array<{ subscription: Subscription; handler: EventHandler }> = [];

  async publish(type: string, payload: unknown, options: PublishOptions = {}): Promise<void> {
    const event = makeEnvelope(type, payload, options.eventId, options.occurredAt);
    const targets = this.subscriptions.filter(s => matchesTopic(s.subscription.pattern, type));
    for (const { handler } of targets) {
      await handler(event);
    }
  }

  async subscribe(subscription: Subscription, handler: EventHandler): Promise<void> {
    this.subscriptions.push({ subscription, handler });
  }

  /** En memoria un handler que falla propaga el error al publicador: nunca hay mensajes muertos. */
  async deadLetterCounts(): Promise<Record<string, number>> {
    return {};
  }

  async close(): Promise<void> {
    this.subscriptions.length = 0;
  }
}
