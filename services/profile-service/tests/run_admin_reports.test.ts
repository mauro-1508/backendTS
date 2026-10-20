import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SectionVisits, TranslationStats } from '../src/domain/admin_report';
import { Logger } from '../src/ports/logger';
import { makeRunAdminReports } from '../src/application/run_admin_reports';
import { AdminRecipient } from '../src/ports/repositories';
import { StatsGateway } from '../src/ports/stats_gateway';
import { makePostgresAdminRecipientRepository } from '../src/adapters/outbound/postgres/admin_report_repositories';
import { makeInMemoryStore } from './in_memory';

// Martes 2026-06-02 08:00 Bogota: tocan el semanal (2026-W22) y el mensual (2026-05), no el recordatorio.
const TUESDAY = new Date('2026-06-02T13:00:00Z');
// Miercoles 2026-06-03 08:00 Bogota: sigue el mensual (hasta el dia 3), el semanal ya cerro y llega el recordatorio.
const WEDNESDAY = new Date('2026-06-03T13:00:00Z');
// Jueves 2026-10-22: fuera de las ventanas del semanal y el mensual; solo queda el recordatorio.
const OLD_THURSDAY = new Date('2026-10-22T13:00:00Z');

const goodStats: TranslationStats = {
  totalTranslations: 500,
  activeUsers30d: 20,
  // Siete dias que terminan el martes 2026-06-02; la semana cerrada (05-25 a 05-31) abarca los cinco primeros.
  daily: [1, 1, 1, 1, 1, 0, 0].map((count, i) => ({ date: new Date(Date.UTC(2026, 4, 27 + i)).toISOString().slice(0, 10), count })),
  weekly: [['2026-05-11', 10], ['2026-05-18', 10], ['2026-05-25', 12], ['2026-06-01', 1]].map(([weekStart, count]) => ({ weekStart: weekStart as string, count: count as number })),
  monthly: new Array(12).fill(0).map((_, i) => ({ month: new Date(Date.UTC(2025, 6 + i, 1)).toISOString().slice(0, 7), count: 10 })),
};

const makeGateway = (over: Partial<StatsGateway> = {}) => {
  const calls = { translationStats: 0, sectionVisits: 0, signTemplateSummary: 0 };
  const gateway: StatsGateway = {
    translationStats: async () => { calls.translationStats++; return goodStats; },
    sectionVisits: async (): Promise<SectionVisits[]> => { calls.sectionVisits++; return [{ section: 'HOME', visits: 5 }]; },
    signTemplateSummary: async () => { calls.signTemplateSummary++; return { words: 8, templates: 20 }; },
    ...over,
  };
  return { gateway, calls };
};

const makeLogger = () => {
  const errors: string[] = [];
  const logger: Logger = { error: message => { errors.push(message); } };
  return { logger, errors };
};

const setup = (admins: AdminRecipient[], now = TUESDAY, gatewayOver: Partial<StatsGateway> = {}) => {
  const { logger, errors } = makeLogger();
  const store = makeInMemoryStore([]);
  const { gateway, calls } = makeGateway(gatewayOver);
  const run = makeRunAdminReports({
    stats: gateway,
    recipients: { touch: async () => {}, listActive: async () => admins },
    reportRuns: store.reportRunQuery,
    unitOfWork: store.unitOfWork,
    logger,
    now: () => now,
  });
  return { store, calls, run, errors };
};

const admins: AdminRecipient[] = [
  { userId: '1', uiLanguage: 'ES' },
  { userId: '2', uiLanguage: 'EN' },
];

describe('run_admin_reports', () => {
  it('crea una notificacion por admin y por reporte con reference_type ADMIN_REPORT', async () => {
    const { store, run } = setup(admins);
    const outcomes = await run();

    assert.deepEqual(outcomes.map(o => [o.kind, o.periodKey, o.notified]), [
      ['WEEKLY', '2026-W22', 2],
      ['MONTHLY', '2026-05', 2],
    ]);
    assert.equal(store.notifications.length, 4);
    for (const n of store.notifications) {
      assert.equal(n.referenceType, 'ADMIN_REPORT');
      assert.ok(n.referenceId);
      assert.ok(n.title.length > 0 && n.title.length <= 150);
    }
    assert.deepEqual(
      store.notifications.map(n => [n.userId, n.typeCode]),
      [['1', 'ADMIN_WEEKLY_REPORT'], ['2', 'ADMIN_WEEKLY_REPORT'], ['1', 'ADMIN_MONTHLY_REPORT'], ['2', 'ADMIN_MONTHLY_REPORT']],
    );
  });

  it('los dos admins de un reporte comparten el mismo referenceId (el run reclamado)', async () => {
    const { store, run } = setup(admins);
    await run();
    const weekly = store.notifications.filter(n => n.typeCode === 'ADMIN_WEEKLY_REPORT');
    assert.equal(weekly[0].referenceId, weekly[1].referenceId);
    assert.notEqual(weekly[0].referenceId, store.notifications.find(n => n.typeCode === 'ADMIN_MONTHLY_REPORT')?.referenceId);
  });

  it('cada admin recibe el texto en su idioma', async () => {
    const { store, run } = setup(admins);
    await run();
    const [es, en] = store.notifications.filter(n => n.typeCode === 'ADMIN_WEEKLY_REPORT');
    assert.match(es.body, /Volumen/);
    assert.match(en.body, /Volume/);
  });

  it('el miercoles envia el recordatorio con las plantillas del gateway (el semanal ya no)', async () => {
    const { store, calls, run } = setup(admins, WEDNESDAY);
    const outcomes = await run();
    assert.deepEqual(outcomes.map(o => o.kind), ['MONTHLY', 'MODEL_REMINDER']);
    assert.equal(calls.signTemplateSummary, 1);
    const reminder = store.notifications.find(n => n.typeCode === 'ADMIN_MODEL_REMINDER');
    assert.match(reminder?.body ?? '', /8 palabras \(20 plantillas\)/);
  });

  it('una segunda ejecucion no duplica notificaciones ni vuelve a llamar al gateway', async () => {
    const { store, calls, run } = setup(admins);
    await run();
    const callsAfterFirst = { ...calls };
    const secondOutcomes = await run();

    assert.deepEqual(secondOutcomes, []);
    assert.equal(store.notifications.length, 4);
    assert.deepEqual(calls, callsAfterFirst);
  });

  it('dos ejecuciones simultaneas no duplican (el claim lo gana una sola)', async () => {
    const { store, run } = setup(admins);
    await Promise.all([run(), run()]);
    assert.equal(store.notifications.length, 4);
  });

  it('no notifica a un admin borrado aunque siga en la lista', async () => {
    const { store, run } = setup([...admins, { userId: '3', uiLanguage: 'ES' }]);
    store.erasedUsers.add('3');
    const outcomes = await run();
    assert.deepEqual(outcomes.map(o => o.notified), [2, 2]);
    assert.ok(store.notifications.every(n => n.userId !== '3'));
  });

  it('si no se crea ninguna notificacion hay rollback: el periodo no se reclama y se registra el error', async () => {
    const { store, run, errors } = setup([{ userId: '3', uiLanguage: 'ES' }]);
    store.erasedUsers.add('3');
    const outcomes = await run();
    assert.deepEqual(outcomes, []);
    assert.equal(store.claimedReports.size, 0);
    assert.equal(store.notifications.length, 0);
    assert.equal(errors.length, 2);
  });

  it('si recognition falla no reclama el periodo y se reintenta en la siguiente vuelta', async () => {
    let failing = true;
    const { store, run } = setup(admins, TUESDAY, {
      translationStats: async () => {
        if (failing) throw new Error('recognition caido');
        return goodStats;
      },
    });

    const first = await run();
    assert.deepEqual(first, []);
    assert.equal(store.claimedReports.size, 0);
    assert.equal(store.notifications.length, 0);

    failing = false;
    const second = await run();
    assert.equal(second.length, 2);
    assert.equal(store.claimedReports.size, 2);
    assert.equal(store.notifications.length, 4);
  });

  it('una forma invalida de recognition (rechazo) tampoco reclama; el recordatorio fallido no frena a los demas', async () => {
    const { store, run } = setup(admins, WEDNESDAY, {
      signTemplateSummary: async () => { throw new Error('plantillas caidas'); },
    });
    const outcomes = await run();
    assert.deepEqual(outcomes.map(o => o.kind), ['MONTHLY']);
    assert.equal(store.claimedReports.has('MODEL_REMINDER:2026-W23'), false);
  });

  it('si analytics falla envia igualmente el resumen sin la linea de secciones', async () => {
    const { store, run } = setup(admins, TUESDAY, {
      sectionVisits: async () => { throw new Error('analytics caido'); },
    });
    const outcomes = await run();

    assert.deepEqual(outcomes.map(o => o.notified), [2, 2]);
    assert.equal(store.notifications.length, 4);
    for (const n of store.notifications) {
      assert.doesNotMatch(n.body, /Secciones|Sections/);
      assert.equal(n.body.split('\n').length, 2);
    }
  });

  it('con analytics disponible el resumen incluye la linea de secciones', async () => {
    const { store, run } = setup(admins);
    await run();
    assert.match(store.notifications[0].body, /Secciones/);
  });

  it('pide a analytics los rangos del periodo actual y del previo', async () => {
    const ranges: { from: string; to: string }[] = [];
    const { run } = setup(admins, TUESDAY, {
      sectionVisits: async range => { ranges.push(range); return []; },
    });
    await run();
    assert.deepEqual(ranges, [
      { from: '2026-05-25', to: '2026-05-31' },
      { from: '2026-05-18', to: '2026-05-24' },
      { from: '2026-05-01', to: '2026-05-31' },
      { from: '2026-04-01', to: '2026-04-30' },
    ]);
  });

  it('sin admins no llama al gateway ni reclama periodos', async () => {
    const { store, calls, run } = setup([]);
    assert.deepEqual(await run(), []);
    assert.deepEqual(calls, { translationStats: 0, sectionVisits: 0, signTemplateSummary: 0 });
    assert.equal(store.claimedReports.size, 0);
  });

  it('un periodo ya reclamado no llama al gateway', async () => {
    const { store, calls, run } = setup(admins);
    store.claimedReports.set('WEEKLY:2026-W22', 'run-x');
    store.claimedReports.set('MONTHLY:2026-05', 'run-y');
    assert.deepEqual(await run(), []);
    assert.deepEqual(calls, { translationStats: 0, sectionVisits: 0, signTemplateSummary: 0 });
    assert.equal(store.notifications.length, 0);
  });

  it('con un solo reporte reclamado, solo se genera el pendiente', async () => {
    const { store, run } = setup(admins);
    store.claimedReports.set('WEEKLY:2026-W22', 'run-x');
    const outcomes = await run();
    assert.deepEqual(outcomes.map(o => o.kind), ['MONTHLY']);
    assert.equal(store.notifications.length, 2);
  });

  it('fuera de hora (lunes 07:59 Bogota) el semanal no se envia', async () => {
    const { store, run } = setup(admins, new Date('2026-06-01T12:59:00Z'));
    const outcomes = await run();
    assert.deepEqual(outcomes, []);
    assert.equal(store.notifications.length, 0);
  });

  it('pasada la ventana de gracia no se envian reportes atrasados (solo el recordatorio vigente)', async () => {
    const { store, calls, run } = setup(admins, OLD_THURSDAY);
    const outcomes = await run();
    assert.deepEqual(outcomes.map(o => o.kind), ['MODEL_REMINDER']);
    assert.equal(calls.translationStats, 0);
    assert.ok(store.notifications.every(n => n.typeCode === 'ADMIN_MODEL_REMINDER'));
  });

  it('por dia del semanal usa solo los dias de la semana cerrada y dice X de N', async () => {
    const { store, run } = setup(admins);
    await run();
    assert.match(store.notifications[0].body, /5 de 5 días con traducciones/);
  });

  it('si la serie de recognition no coincide con el periodo, no reclama y registra el error', async () => {
    const { store, run, errors } = setup(admins, TUESDAY, {
      translationStats: async () => ({
        ...goodStats,
        weekly: goodStats.weekly.map(w => ({ ...w, weekStart: '2026-01-05' })),
        monthly: goodStats.monthly.map(m => ({ ...m, month: '2026-01' })),
      }),
    });
    assert.deepEqual(await run(), []);
    assert.equal(store.claimedReports.size, 0);
    assert.equal(errors.length, 2);
  });
});

describe('listActive (adaptador Postgres)', () => {
  it('filtra notificaciones desactivadas y usuarios borrados, y cae a ES sin preferencias', async () => {
    let sql = '';
    const db = {
      query: async (text: string) => {
        sql = text.replace(/\s+/g, ' ');
        return { rows: [{ user_id: '1', ui_language: 'EN' }], rowCount: 1 };
      },
    };
    const result = await makePostgresAdminRecipientRepository(db as never).listActive();

    assert.deepEqual(result, [{ userId: '1', uiLanguage: 'EN' }]);
    assert.match(sql, /JOIN user_profiles/);
    assert.match(sql, /COALESCE\(f\.notifications_enabled, TRUE\)/);
    assert.match(sql, /NOT EXISTS \(SELECT 1 FROM erased_users/);
    assert.match(sql, /a\.last_seen_at > now\(\) - interval '30 days'/);
    assert.match(sql, /COALESCE\(f\.ui_language, 'ES'\)/);
  });
});
