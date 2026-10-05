import { ClosableEventPublisher } from './event_publisher';
import { InMemoryEventPublisher } from './in_memory_event_publisher';
import { RabbitMqEventPublisher } from './rabbitmq_event_publisher';

/** RabbitMQ si hay URL; si no, publicador en memoria. */
export const createEventPublisher = (rabbitmqUrl: string): ClosableEventPublisher =>
  rabbitmqUrl ? new RabbitMqEventPublisher(rabbitmqUrl) : new InMemoryEventPublisher();
