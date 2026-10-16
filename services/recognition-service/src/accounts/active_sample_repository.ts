import { Pool } from 'pg';
import { SampleRepository } from '../samples/ports/outbound/sample_repository';
import { withActiveAccount } from './active_account';

/** Conserva las muestras y su política; serializa solo la creación con el borrado del operador. */
export const makeActiveSampleRepository = (pool: Pool, repository: SampleRepository): SampleRepository => ({
  create: sample => withActiveAccount(pool, sample.recordedBy, () => repository.create(sample)),
  list: filter => repository.list(filter),
  unlinkRecorder: userId => repository.unlinkRecorder(userId),
});
