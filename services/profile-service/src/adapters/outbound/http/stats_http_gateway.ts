import { PERMISSIONS, TokenProvider } from '@traduce/shared';
import { SectionVisits, TranslationStats } from '../../../domain/admin_report';
import { StatsGateway } from '../../../ports/stats_gateway';

const REQUEST_TIMEOUT_MS = 5000;
const SERVICE_USER_ID = 0;
const SERVICE_EMAIL = 'profile-service@internal';
const DAILY_POINTS = 7;
const WEEKLY_POINTS = 4;
const MONTHLY_POINTS = 12;

type Json = Record<string, any>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null;
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const requireSeries = (value: unknown, length: number, name: string, isPoint: (point: Json) => boolean): void => {
  if (!Array.isArray(value) || value.length !== length || !value.every(point => isObject(point) && isPoint(point))) {
    throw new Error(`recognition: la serie ${name} no tiene la forma esperada`);
  }
};

const parseTranslationStats = (data: unknown): TranslationStats => {
  if (!isObject(data) || !isCount(data.totalTranslations) || !isCount(data.activeUsers30d)) {
    throw new Error('recognition: las estadisticas de traducciones no tienen la forma esperada');
  }
  requireSeries(data.daily, DAILY_POINTS, 'daily', p => typeof p.date === 'string' && isCount(p.count));
  requireSeries(data.weekly, WEEKLY_POINTS, 'weekly', p => typeof p.weekStart === 'string' && isCount(p.count));
  requireSeries(data.monthly, MONTHLY_POINTS, 'monthly', p => typeof p.month === 'string' && isCount(p.count));
  return data as TranslationStats;
};

const parseSections = (data: unknown): SectionVisits[] => {
  const sections = isObject(data) ? data.sections : undefined;
  if (!Array.isArray(sections) || !sections.every(s => isObject(s) && typeof s.section === 'string' && isCount(s.visits))) {
    throw new Error('analytics: el reporte de secciones no tiene la forma esperada');
  }
  return sections.map(s => ({ section: s.section, visits: s.visits }));
};

/**
 * Cuenta plantillas y palabras (labels distintos).
 * TODO: baja la lista completa de plantillas (con features); pedir a recognition un endpoint de conteo.
 */
const parseTemplates = (data: unknown) => {
  if (!Array.isArray(data) || !data.every(t => isObject(t) && typeof t.label === 'string')) {
    throw new Error('recognition: las plantillas no tienen la forma esperada');
  }
  return { words: new Set(data.map(t => t.label)).size, templates: data.length };
};

/** Lee los servicios hermanos por HTTP interno con un bearer de servicio de vida corta. */
export const makeStatsHttpGateway = (deps: {
  recognitionUrl: string;
  analyticsUrl: string;
  /** Debe firmar con expiracion corta (p. ej. 5m). */
  serviceTokens: TokenProvider;
  fetchFn?: typeof fetch;
}): StatsGateway => {
  const fetchFn = deps.fetchFn ?? fetch;

  const getData = async (url: string, authenticated: boolean): Promise<unknown> => {
    const headers: Record<string, string> = {};
    if (authenticated) {
      const token = deps.serviceTokens.sign({
        userId: SERVICE_USER_ID, email: SERVICE_EMAIL, roles: [], permissions: [PERMISSIONS.STATS_READ],
      });
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetchFn(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`${new URL(url).pathname} respondio ${response.status}`);
    }
    const body: unknown = await response.json();
    if (!isObject(body)) throw new Error(`${new URL(url).pathname} devolvio un cuerpo invalido`);
    return body.data;
  };

  return {
    translationStats: async () =>
      parseTranslationStats(await getData(`${deps.recognitionUrl}/api/translations/stats`, true)),

    sectionVisits: async ({ from, to }) => {
      const query = new URLSearchParams({ from, to });
      return parseSections(await getData(`${deps.analyticsUrl}/api/analytics/reports/sections?${query}`, true));
    },

    signTemplateSummary: async () =>
      parseTemplates(await getData(`${deps.recognitionUrl}/api/recognition/sign-templates`, false)),
  };
};
