export interface RetentionScheduler {
  /** Detiene las vueltas nuevas; la promesa termina cuando acaba la que estuviera en curso. */
  stop(): Promise<void>;
}

/**
 * Ejecuta `run` al arrancar y en cada vuelta (mismo patron que el scheduler de profile).
 * Un error se registra y nunca tumba el proceso; dos vueltas no se solapan.
 */
export const startRetentionScheduler = (deps: {
  run: () => Promise<number>;
  tickMs: number;
  log?: (message: string) => void;
}): RetentionScheduler => {
  const log = deps.log ?? (message => console.log(message));
  let current: Promise<void> | undefined;

  const runSafely = async (): Promise<void> => {
    try {
      const purged = await deps.run();
      if (purged > 0) log(`[recognition] retencion: ${purged} traducciones vencidas borradas`);
    } catch (error) {
      console.error('[recognition] fallo la vuelta de retencion de traducciones', error);
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
