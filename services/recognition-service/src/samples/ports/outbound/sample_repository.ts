import { GestureSample, NewGestureSample, SampleFilter } from '../../domain/entity';

export interface SampleRepository {
  create(sample: NewGestureSample): Promise<GestureSample>;
  list(filter: SampleFilter): Promise<GestureSample[]>;
}
