export interface SampleResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

export interface SampleService {
  register(input: { body: Record<string, unknown>; userId: number }): Promise<SampleResult>;
  list(input: { signCode?: string }): Promise<SampleResult>;
}
