import { TransactionalRepositories, UnitOfWork } from '../ports/repositories';

/**
 * Ejecuta `work` solo si el eventId no se habia procesado, en la misma transaccion
 * que el registro del evento: o se aplica todo o nada (idempotencia por eventId).
 * Devuelve undefined si el evento era un duplicado.
 */
export const processEventOnce = <T>(
  unitOfWork: UnitOfWork,
  eventId: string,
  work: (repositories: TransactionalRepositories) => Promise<T>,
): Promise<T | undefined> =>
  unitOfWork.run(async repositories => {
    const isNew = await repositories.processedEvents.markIfNew(eventId);
    return isNew ? work(repositories) : undefined;
  });
