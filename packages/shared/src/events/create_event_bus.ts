import { EventBus } from './event_bus';
import { InMemoryEventBus } from './in_memory_event_bus';
import { RabbitMqEventBus } from './rabbitmq_event_bus';

/** RabbitMQ si hay URL; si no, bus en memoria. */
export const createEventBus = (rabbitmqUrl: string): EventBus =>
  rabbitmqUrl ? new RabbitMqEventBus(rabbitmqUrl) : new InMemoryEventBus();
