import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startAdminReportsScheduler } from '../src/adapters/inbound/scheduler/admin_reports_scheduler';

describe('admin_reports_scheduler', () => {
  it('ejecuta al arrancar, repite por vuelta y se detiene con stop', async () => {
    let runs = 0;
    const scheduler = startAdminReportsScheduler({ run: async () => { runs++; }, tickMs: 10 });
    await new Promise(resolve => setTimeout(resolve, 60));
    scheduler.stop();
    const atStop = runs;
    assert.ok(atStop >= 2, `ejecuciones: ${atStop}`);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(runs, atStop);
  });

  it('stop() espera a que termine la vuelta en curso', async () => {
    let finished = false;
    const scheduler = startAdminReportsScheduler({
      run: async () => { await new Promise(resolve => setTimeout(resolve, 40)); finished = true; },
      tickMs: 1000,
    });
    await scheduler.stop();
    assert.equal(finished, true);
  });

  it('un error no tumba el proceso y las vueltas siguen', async () => {
    const original = console.error;
    console.error = () => {};
    let runs = 0;
    const scheduler = startAdminReportsScheduler({ run: async () => { runs++; throw new Error('boom'); }, tickMs: 10 });
    try {
      await new Promise(resolve => setTimeout(resolve, 60));
    } finally {
      scheduler.stop();
      console.error = original;
    }
    assert.ok(runs >= 2);
  });

  it('no solapa vueltas: si una sigue en curso, la siguiente se omite', async () => {
    let active = 0;
    let maxActive = 0;
    const scheduler = startAdminReportsScheduler({
      run: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 40));
        active--;
      },
      tickMs: 5,
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    scheduler.stop();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(maxActive, 1);
  });
});
