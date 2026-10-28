import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildModelReminder, buildMonthlyDigest, buildWeeklyDigest, compareTrend, DigestInput, statsMatchPeriod,
  TranslationStats,
} from '../src/domain/admin_report';
import { dueReports, periodOf } from '../src/domain/admin_report_schedule';
import { REPORT_MESSAGES } from '../src/domain/admin_report_messages';
import { UiLanguage } from '../src/domain/preferences';

// Bogota es UTC-5 fijo: 08:00 en Bogota son las 13:00 UTC.
const bogota = (iso: string): Date => new Date(`${iso}-05:00`);

describe('compareTrend', () => {
  it('0 contra 0 es NO_DATA sin porcentaje', () => {
    assert.deepEqual(compareTrend(0, 0), { trend: 'NO_DATA', changePercent: null });
  });

  it('desde 0 hacia n es GOOD sin porcentaje; de n a 0 es BAD -100', () => {
    assert.deepEqual(compareTrend(5, 0), { trend: 'GOOD', changePercent: null });
    assert.deepEqual(compareTrend(0, 5), { trend: 'BAD', changePercent: -100 });
  });

  it('+10 % exacto es GOOD y -10 % exacto es BAD (el umbral es inclusivo)', () => {
    assert.deepEqual(compareTrend(110, 100), { trend: 'GOOD', changePercent: 10 });
    assert.deepEqual(compareTrend(90, 100), { trend: 'BAD', changePercent: -10 });
  });

  it('9 % arriba o abajo es STABLE', () => {
    assert.deepEqual(compareTrend(109, 100), { trend: 'STABLE', changePercent: 9 });
    assert.deepEqual(compareTrend(91, 100), { trend: 'STABLE', changePercent: -9 });
  });

  it('sin cambio es STABLE con 0 %', () => {
    assert.deepEqual(compareTrend(50, 50), { trend: 'STABLE', changePercent: 0 });
  });
});

describe('periodOf', () => {
  it('semanal: semana ISO cerrada anterior a la actual (lunes 2026-10-19)', () => {
    const period = periodOf('WEEKLY', bogota('2026-10-19T08:00:00'));
    assert.equal(period.periodKey, '2026-W42');
    assert.deepEqual(period.current, { from: '2026-10-12', to: '2026-10-18' });
    assert.deepEqual(period.previous, { from: '2026-10-05', to: '2026-10-11' });
  });

  it('el recordatorio usa la semana en curso', () => {
    const period = periodOf('MODEL_REMINDER', bogota('2026-10-21T09:00:00'));
    assert.equal(period.periodKey, '2026-W43');
    assert.deepEqual(period.current, { from: '2026-10-19', to: '2026-10-25' });
  });

  it('mensual: dia 1 reporta el mes anterior completo', () => {
    const period = periodOf('MONTHLY', bogota('2026-10-01T08:00:00'));
    assert.equal(period.periodKey, '2026-09');
    assert.deepEqual(period.current, { from: '2026-09-01', to: '2026-09-30' });
    assert.deepEqual(period.previous, { from: '2026-08-01', to: '2026-08-31' });
  });

  it('mensual: cambio de año reporta diciembre del año anterior', () => {
    const period = periodOf('MONTHLY', bogota('2027-01-01T08:00:00'));
    assert.equal(period.periodKey, '2026-12');
    assert.deepEqual(period.current, { from: '2026-12-01', to: '2026-12-31' });
    assert.deepEqual(period.previous, { from: '2026-11-01', to: '2026-11-30' });
  });

  it('mensual: febrero bisiesto termina el 29', () => {
    const period = periodOf('MONTHLY', bogota('2028-03-01T08:00:00'));
    assert.deepEqual(period.current, { from: '2028-02-01', to: '2028-02-29' });
  });

  it('semana ISO 53 (2026-12-28..2027-01-03) cruza de año', () => {
    const period = periodOf('WEEKLY', bogota('2027-01-04T08:00:00'));
    assert.equal(period.periodKey, '2026-W53');
    assert.deepEqual(period.current, { from: '2026-12-28', to: '2027-01-03' });
    assert.deepEqual(period.previous, { from: '2026-12-21', to: '2026-12-27' });
  });

  it('2026-12-31 y 2027-01-01 siguen en la semana ISO 53 (recordatorio en curso)', () => {
    assert.equal(periodOf('MODEL_REMINDER', bogota('2026-12-31T10:00:00')).periodKey, '2026-W53');
    assert.equal(periodOf('MODEL_REMINDER', bogota('2027-01-01T10:00:00')).periodKey, '2026-W53');
  });

  it('la primera semana ISO del año siguiente es W01', () => {
    assert.equal(periodOf('WEEKLY', bogota('2027-01-11T08:00:00')).periodKey, '2027-W01');
    // 2024-12-30 es lunes de la semana ISO 2025-W01.
    assert.equal(periodOf('WEEKLY', bogota('2025-01-06T08:00:00')).periodKey, '2025-W01');
  });

  it('usa el calendario de Bogota, no el de UTC', () => {
    // 2026-10-19 03:00 UTC = domingo 22:00 en Bogota: aun es la semana anterior.
    const period = periodOf('WEEKLY', new Date('2026-10-19T03:00:00Z'));
    assert.equal(period.periodKey, '2026-W41');
  });
});

describe('dueReports', () => {
  it('lunes 07:59 Bogota aun no toca el semanal; a las 08:00 si', () => {
    assert.ok(!dueReports(bogota('2026-10-19T07:59:00')).includes('WEEKLY'));
    assert.ok(dueReports(bogota('2026-10-19T08:00:00')).includes('WEEKLY'));
  });

  it('el limite se mide en hora local: 12:59 UTC no, 13:00 UTC si', () => {
    assert.ok(!dueReports(new Date('2026-10-19T12:59:00Z')).includes('WEEKLY'));
    assert.ok(dueReports(new Date('2026-10-19T13:00:00Z')).includes('WEEKLY'));
  });

  it('el semanal sigue debido hasta el martes 23:59 y despues se descarta', () => {
    assert.ok(dueReports(bogota('2026-10-19T23:59:00')).includes('WEEKLY'));
    assert.ok(dueReports(bogota('2026-10-20T23:59:00')).includes('WEEKLY'));
    assert.ok(!dueReports(bogota('2026-10-21T00:00:00')).includes('WEEKLY'));
    assert.ok(!dueReports(bogota('2026-10-25T20:00:00')).includes('WEEKLY'));
  });

  it('dia 1: el mensual espera a las 08:00', () => {
    assert.ok(!dueReports(bogota('2026-10-01T07:59:00')).includes('MONTHLY'));
    assert.ok(dueReports(bogota('2026-10-01T08:00:00')).includes('MONTHLY'));
    assert.ok(dueReports(bogota('2026-10-02T00:00:00')).includes('MONTHLY'));
  });

  it('el mensual dura hasta el dia 3 a las 23:59 y despues se descarta', () => {
    assert.ok(dueReports(bogota('2026-10-03T23:59:00')).includes('MONTHLY'));
    assert.ok(!dueReports(bogota('2026-10-04T00:00:00')).includes('MONTHLY'));
    assert.ok(!dueReports(bogota('2026-10-20T10:00:00')).includes('MONTHLY'));
  });

  it('1 de enero: el mensual toca a las 08:00', () => {
    assert.ok(!dueReports(bogota('2027-01-01T07:59:00')).includes('MONTHLY'));
    assert.ok(dueReports(bogota('2027-01-01T08:00:00')).includes('MONTHLY'));
  });

  it('el recordatorio se envia del miercoles 08:00 al jueves 23:59', () => {
    assert.ok(!dueReports(bogota('2026-10-20T23:59:00')).includes('MODEL_REMINDER')); // martes
    assert.ok(!dueReports(bogota('2026-10-21T07:59:00')).includes('MODEL_REMINDER'));
    assert.ok(dueReports(bogota('2026-10-21T08:00:00')).includes('MODEL_REMINDER'));
    assert.ok(dueReports(bogota('2026-10-22T23:59:00')).includes('MODEL_REMINDER')); // jueves
    assert.ok(!dueReports(bogota('2026-10-23T00:00:00')).includes('MODEL_REMINDER')); // viernes
    assert.ok(!dueReports(bogota('2026-10-26T09:00:00')).includes('MODEL_REMINDER')); // lunes
  });

  it('un martes 20 solo trae el semanal; el 1 de junio (lunes) 08:00 trae semanal y mensual', () => {
    assert.deepEqual(dueReports(bogota('2026-10-20T10:00:00')), ['WEEKLY']);
    assert.deepEqual(dueReports(bogota('2026-06-01T08:00:00')), ['WEEKLY', 'MONTHLY']);
  });

  it('statsMatchPeriod exige que la ultima semana/mes cerrados sean los del periodo', () => {
    const period = periodOf('WEEKLY', bogota('2026-10-19T08:00:00'));
    const stats = (weekStart: string) => ({
      totalTranslations: 0, activeUsers30d: 0, daily: [], monthly: [],
      weekly: [{ weekStart: '2026-10-05', count: 1 }, { weekStart, count: 1 }, { weekStart: '2026-10-19', count: 0 }],
    }) as TranslationStats;
    assert.equal(statsMatchPeriod(period, stats('2026-10-12')), true);
    assert.equal(statsMatchPeriod(period, stats('2026-10-05')), false);
  });
});

// ---- Builders ----

const daily = (counts: number[]) => counts.map((count, i) => ({ date: `2026-10-${String(12 + i).padStart(2, '0')}`, count }));
const weekly = (counts: number[]) => counts.map((count, i) => ({ weekStart: `2026-09-${String(21 + i * 7).padStart(2, '0')}`, count }));
const MONTHS = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const monthly = (counts: number[], keys: string[] = MONTHS) => counts.map((count, i) => ({ month: keys[i], count }));

const stats = (over: Partial<TranslationStats> = {}): TranslationStats => ({
  totalTranslations: 1000,
  activeUsers30d: 50,
  daily: daily([10, 10, 10, 10, 10, 0, 0]),
  weekly: weekly([100, 100, 120, 5]),
  monthly: monthly([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 120, 3]),
  ...over,
});

describe('buildWeeklyDigest', () => {
  it('tono GOOD: 5 dias activos y volumen al alza celebra con el porcentaje', () => {
    const { title, body } = buildWeeklyDigest({ stats: stats() }, 'ES');
    assert.match(title, /Las traducciones subieron esta semana/);
    assert.match(title, /\(\+20%\)$/);
    assert.match(body, /5 de 7 días/);
    assert.match(body, /Volumen: 120 traducciones, \+20% frente a la semana anterior/);
  });

  it('tono BAD: pocos dias activos y volumen a la baja alerta con signo menos', () => {
    const input = { stats: stats({ daily: daily([5, 0, 0, 0, 0, 0, 0]), weekly: weekly([100, 100, 50, 1]) }) };
    const { title } = buildWeeklyDigest(input, 'ES');
    assert.match(title, /bajó la actividad/);
    assert.match(title, /\(−50%\)$/);
  });

  it('tono neutro: 3 dias activos y volumen estable', () => {
    const input = { stats: stats({ daily: daily([4, 4, 4, 0, 0, 0, 0]), weekly: weekly([100, 100, 105, 1]) }) };
    const { title } = buildWeeklyDigest(input, 'ES');
    assert.match(title, /resumen semanal está listo/);
    assert.match(title, /\(\+5%\)$/);
  });

  it('NO_DATA: semana sin nada es silenciosa, sin porcentaje y sin dia destacado', () => {
    const input = { stats: stats({ daily: daily([0, 0, 0, 0, 0, 0, 0]), weekly: weekly([0, 0, 0, 0]) }) };
    const { title, body } = buildWeeklyDigest(input, 'ES');
    assert.match(title, /Semana silenciosa/);
    assert.doesNotMatch(title, /%/);
    assert.match(body, /0 de 7 días con traducciones\./);
    assert.doesNotMatch(body, /el mejor/);
  });

  it('el mejor dia sale en el idioma pedido', () => {
    // 2026-10-12 es lunes; el pico cae el miercoles 14.
    const input = { stats: stats({ daily: daily([1, 2, 9, 1, 1, 0, 0]) }) };
    assert.match(buildWeeklyDigest(input, 'ES').body, /el mejor fue el miércoles \(9\)/);
    assert.match(buildWeeklyDigest(input, 'EN').body, /the best was Wednesday \(9\)/);
  });

  it('sin porcentaje cuando la semana previa fue 0 (no hay base de comparacion)', () => {
    const input = { stats: stats({ weekly: weekly([0, 0, 40, 1]) }) };
    const { title, body } = buildWeeklyDigest(input, 'ES');
    assert.doesNotMatch(title, /%/);
    assert.doesNotMatch(body, /frente a la semana anterior/);
  });

  it('incluye la linea de secciones con la mas y la menos visitada', () => {
    const input: DigestInput = {
      stats: stats(),
      sections: {
        current: [{ section: 'HOME', visits: 30 }, { section: 'ALPHABET', visits: 5 }, { section: 'LEXICON', visits: 12 }],
        previous: [{ section: 'HOME', visits: 20 }, { section: 'ALPHABET', visits: 5 }, { section: 'LEXICON', visits: 10 }],
      },
    };
    const { body } = buildWeeklyDigest(input, 'ES');
    assert.match(body, /Inicio lidera con 30 visitas; Alfabeto es la menos visitada \(5\); visitas totales \+34%/);
    assert.doesNotMatch(body, /Sin visitas/);
  });

  it('una sola seccion visitada no inventa "la menos visitada"; un codigo desconocido se muestra tal cual', () => {
    const input: DigestInput = {
      stats: stats(),
      sections: { current: [{ section: 'NUEVA', visits: 4 }], previous: [{ section: 'NUEVA', visits: 4 }] },
    };
    const { body } = buildWeeklyDigest(input, 'ES');
    assert.match(body, /NUEVA lidera con 4 visitas/);
    assert.doesNotMatch(body, /menos visitada/);
  });

  it('una seccion que cae a 0 visitas se avisa aparte', () => {
    const input: DigestInput = {
      stats: stats(),
      sections: {
        current: [{ section: 'HOME', visits: 10 }, { section: 'ALPHABET', visits: 0 }],
        previous: [{ section: 'HOME', visits: 10 }, { section: 'ALPHABET', visits: 3 }, { section: 'HISTORY', visits: 2 }],
      },
    };
    const { body } = buildWeeklyDigest(input, 'ES');
    assert.match(body, /Sin visitas en este periodo: Alfabeto, Historial\./);
    assert.doesNotMatch(body, /Alfabeto es la menos visitada/);
  });

  it('sin datos de secciones (analytics fallo) el resumen sale con 2 lineas', () => {
    const { body } = buildWeeklyDigest({ stats: stats(), sections: undefined }, 'ES');
    assert.equal(body.split('\n').length, 2);
    assert.doesNotMatch(body, /Secciones/);
  });

  it('secciones vacias o todas en 0 tampoco agregan linea', () => {
    const empty = buildWeeklyDigest({ stats: stats(), sections: { current: [], previous: [] } }, 'ES');
    const zeros = buildWeeklyDigest({
      stats: stats(),
      sections: { current: [{ section: 'HOME', visits: 0 }], previous: [{ section: 'HOME', visits: 4 }] },
    }, 'ES');
    assert.equal(empty.body.split('\n').length, 2);
    assert.equal(zeros.body.split('\n').length, 2);
  });

  it('un idioma desconocido cae a ES', () => {
    const es = buildWeeklyDigest({ stats: stats() }, 'ES');
    assert.deepEqual(buildWeeklyDigest({ stats: stats() }, 'ZZ' as UiLanguage), es);
    assert.deepEqual(
      buildModelReminder({ words: 3, templates: 4 }, 'ZZ' as UiLanguage),
      buildModelReminder({ words: 3, templates: 4 }, 'ES'),
    );
  });

  it('cada idioma produce textos distintos', () => {
    const titles = (['ES', 'EN', 'FR', 'PT'] as UiLanguage[]).map(l => buildWeeklyDigest({ stats: stats() }, l).title);
    assert.equal(new Set(titles).size, 4);
  });
});

describe('buildMonthlyDigest', () => {
  it('mes record: supera a todos los meses cerrados anteriores', () => {
    const input = { stats: stats({ monthly: monthly([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150, 2]) }) };
    const { title, body } = buildMonthlyDigest(input, 'ES');
    assert.match(title, /Mes récord! Septiembre/);
    assert.match(title, /\(\+50%\)$/);
    assert.match(body, /Septiembre cerró con 150 traducciones \(\+50% frente al mes anterior\)/);
  });

  it('no es record si algun mes previo fue mayor', () => {
    const input = { stats: stats({ monthly: monthly([10, 20, 300, 40, 50, 60, 70, 80, 90, 100, 150, 2]) }) };
    assert.doesNotMatch(buildMonthlyDigest(input, 'ES').title, /récord/);
  });

  it('no es record si empata con el mejor mes previo', () => {
    const input = { stats: stats({ monthly: monthly([100, 20, 30, 40, 50, 60, 70, 80, 90, 50, 100, 2]) }) };
    assert.doesNotMatch(buildMonthlyDigest(input, 'ES').title, /récord/);
  });

  it('no es record cuando no hay historial previo (todo en 0)', () => {
    const input = { stats: stats({ monthly: monthly([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 1]) }) };
    assert.doesNotMatch(buildMonthlyDigest(input, 'ES').title, /récord/);
  });

  it('tono alza, baja y neutro', () => {
    const up = buildMonthlyDigest({
      stats: stats({ monthly: monthly([100, 100, 100, 100, 100, 300, 100, 100, 100, 100, 130, 1]), weekly: weekly([10, 10, 20, 1]) }),
    }, 'ES');
    assert.match(up.title, /cerró en alza/);

    const down = buildMonthlyDigest({
      stats: stats({ monthly: monthly([100, 100, 100, 100, 100, 300, 100, 100, 100, 100, 50, 1]), weekly: weekly([20, 20, 10, 1]) }),
    }, 'ES');
    assert.match(down.title, /cerró con menos actividad/);
    assert.match(down.title, /\(−50%\)$/);

    const flat = buildMonthlyDigest({
      stats: stats({ monthly: monthly([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 1]), weekly: weekly([10, 10, 10, 1]) }),
    }, 'ES');
    assert.match(flat.title, /resumen de Septiembre está listo/);
  });

  it('NO_DATA: mes silencioso sin porcentaje', () => {
    const input = { stats: stats({ monthly: monthly(new Array(12).fill(0)), weekly: weekly([0, 0, 0, 0]) }) };
    const { title } = buildMonthlyDigest(input, 'ES');
    assert.match(title, /Septiembre fue un mes silencioso/);
    assert.doesNotMatch(title, /%/);
  });

  it('nombre del mes en el idioma y fallback a ES', () => {
    assert.match(buildMonthlyDigest({ stats: stats() }, 'EN').title, /September/);
    assert.match(buildMonthlyDigest({ stats: stats() }, 'ZZ' as UiLanguage).title, /Septiembre/);
  });

  it('cambio de año: el mes cerrado puede ser diciembre', () => {
    const keys = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
    // El ultimo punto es el mes en curso (parcial); el cerrado es el penultimo.
    const shifted = ['2025-12', ...keys.slice(0, 10), '2026-12', '2027-01'].slice(0, 12);
    shifted[10] = '2026-12';
    shifted[11] = '2027-01';
    const input = { stats: stats({ monthly: monthly(new Array(12).fill(100), shifted) }) };
    assert.match(buildMonthlyDigest(input, 'ES').title, /Diciembre/);
  });

  it('sin secciones (analytics fallo) el resumen mensual tiene 2 lineas; con secciones, 3', () => {
    assert.equal(buildMonthlyDigest({ stats: stats() }, 'ES').body.split('\n').length, 2);
    const withSections = buildMonthlyDigest({
      stats: stats(),
      sections: { current: [{ section: 'HOME', visits: 5 }], previous: [{ section: 'HOME', visits: 5 }] },
    }, 'ES');
    assert.equal(withSections.body.split('\n').length, 3);
  });
});

describe('buildModelReminder', () => {
  it('usa palabras y plantillas en el cuerpo', () => {
    const { title, body } = buildModelReminder({ words: 12, templates: 40 }, 'ES');
    assert.match(title, /Entrena al traductor/);
    assert.match(body, /12 palabras \(40 plantillas\)/);
  });
});

describe('semanal con semana cerrada', () => {
  const weekRange = { from: '2026-10-12', to: '2026-10-18' };

  it('cuenta solo los dias de la semana y dice X de N cuando hay menos de 7', () => {
    // daily: 2026-10-12 a 2026-10-18 con el lunes 10-12 fuera si la ventana empieza el 10-14.
    const custom = { ...stats(), daily: daily([1, 1, 1, 9, 1, 1, 1]).slice(2) };
    const { body } = buildWeeklyDigest({ stats: custom, weekRange: { from: '2026-10-14', to: '2026-10-18' } }, 'ES');
    assert.match(body, /5 de 5 días con traducciones; el mejor fue el /);
  });

  it('ignora los dias fuera de la semana (p. ej. el lunes en curso)', () => {
    const custom = { ...stats(), daily: [...daily([0, 0, 0, 0, 0, 0]), { date: '2026-10-19', count: 99 }] };
    const { body } = buildWeeklyDigest({ stats: custom, weekRange }, 'ES');
    assert.match(body, /0 de 6 días con traducciones\./);
    assert.doesNotMatch(body, /99/);
  });

  it('sin ningun dia disponible omite la linea de dias', () => {
    const custom = { ...stats(), daily: [{ date: '2026-10-19', count: 5 }] };
    const { body } = buildWeeklyDigest({ stats: custom, weekRange }, 'ES');
    assert.doesNotMatch(body, /Por día/);
  });
});

describe('titulos', () => {
  it('nunca superan 150 caracteres, ni con porcentajes enormes en todos los idiomas', () => {
    const huge = stats({
      weekly: weekly([1, 1, 5_000_000, 1]),
      monthly: monthly([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5_000_000, 1]),
    });
    for (const language of Object.keys(REPORT_MESSAGES) as UiLanguage[]) {
      assert.ok(buildWeeklyDigest({ stats: huge }, language).title.length <= 150);
      assert.ok(buildMonthlyDigest({ stats: huge }, language).title.length <= 150);
      assert.ok(buildModelReminder({ words: 1, templates: 1 }, language).title.length <= 150);
    }
  });

  it('un titulo base demasiado largo se recorta a 150 caracteres', () => {
    const original = REPORT_MESSAGES.ES.weeklyTitle.NEUTRAL;
    REPORT_MESSAGES.ES.weeklyTitle.NEUTRAL = 'x'.repeat(200);
    try {
      const input = { stats: stats({ daily: daily([4, 4, 4, 0, 0, 0, 0]), weekly: weekly([100, 100, 105, 1]) }) };
      assert.equal(buildWeeklyDigest(input, 'ES').title.length, 150);
    } finally {
      REPORT_MESSAGES.ES.weeklyTitle.NEUTRAL = original;
    }
  });

  it('todos los titulos fijos de cada idioma caben en 150 caracteres con sufijo de porcentaje', () => {
    for (const messages of Object.values(REPORT_MESSAGES)) {
      const monthTitles = Object.values(messages.monthlyTitle).flatMap(f => messages.months.map(m => f(m)));
      const all = [...Object.values(messages.weeklyTitle), ...monthTitles, messages.reminderTitle];
      for (const title of all) assert.ok(title.length + ' (−1000%)'.length <= 150, title);
    }
  });
});
