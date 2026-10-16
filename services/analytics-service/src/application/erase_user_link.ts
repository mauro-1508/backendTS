import { EventHandler, isUserDeleted, withValidPayload } from '@traduce/shared';
import { UsageEventRepository } from '../domain/repository';

/**
 * iam.UserDeleted: desliga al usuario de los hechos de uso (se conservan como estadistica
 * anonima) y registra el id como borrado. Idempotente; un payload invalido se descarta con log.
 */
export const makeEraseUserLink = (deps: { repository: UsageEventRepository }): EventHandler =>
  withValidPayload(isUserDeleted, async envelope => {
    await deps.repository.unlinkUser(String(envelope.payload.userId));
  });
