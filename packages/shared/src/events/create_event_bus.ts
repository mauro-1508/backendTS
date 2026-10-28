import { EventBus } from './event_bus';
import { DeadLetterInspector } from './dead_letter_check';
import { InMemoryEventBus } from './in_memory_event_bus';
import { RabbitMqEventBus, RabbitMqOptions } from './rabbitmq_event_bus';

/** RabbitMQ si hay URL; si no, bus en memoria. */
export const createEventBus = (rabbitmqUrl: string, options?: RabbitMqOptions): EventBus & DeadLetterInspector =>
  rabbitmqUrl ? new RabbitMqEventBus(rabbitmqUrl, options) : new InMemoryEventBus();
