import { randomUUID } from 'node:crypto';
import { GestureSample } from '../../../domain/entity';
import { SampleRepository } from '../../../ports/outbound/sample_repository';

/** Repositorio en proceso: para tests y para desarrollo sin MongoDB (MONGO_URL vacio). */
export class InMemorySampleRepository implements SampleRepository {
  private readonly samples: GestureSample[] = [];

  async create(sample: Parameters<SampleRepository['create']>[0]): Promise<GestureSample> {
    const created: GestureSample = { ...sample, sampleId: randomUUID(), isValidated: false, createdAt: new Date() };
    this.samples.push(created);
    return created;
  }

  async list({ signCode }: Parameters<SampleRepository['list']>[0]): Promise<GestureSample[]> {
    return this.samples.filter(s => !signCode || s.signCode === signCode);
  }
}
