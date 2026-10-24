export interface AdminReportsScheduler {
  /** Detiene las vueltas nuevas; la promesa termina cuando acaba la que estuviera en curso. */
  stop(): Promise<void>;
}

/** Ejecuta `run` al arrancar y en cada vuelta; un error se registra y nunca tumba el proceso. */
export const startAdminReportsScheduler = (deps: {
  run: () => Promise<unknown>;
  tickMs: number;
}): AdminReportsScheduler => {
  let current: Promise<void> | undefined;

  const runSafely = async (): Promise<void> => {
    try {
      await deps.run();
    } catch (error) {
      console.error('[profile] fallo la vuelta de reportes de administracion', error);
    }
  };

  const tick = (): void => {
    if (current) return;
    current = runSafely().finally(() => { current = undefined; });
  };

  tick();
  const timer = setInterval(tick, deps.tickMs);
  return {
    stop: async () => {
      clearInterval(timer);
      await current;
    },
  };
};
