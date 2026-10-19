import { GestureSample } from '../../domain/entity';

export interface SampleService {
  register(input: { body: Record<string, unknown>; userId: number }): Promise<GestureSample>;
  list(input: { signCode?: string }): Promise<GestureSample[]>;
}
