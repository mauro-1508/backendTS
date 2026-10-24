import {
  BestDay, MonthlyTone, ReportMessages, SectionHighlight, Tone, messagesFor,
} from './admin_report_messages';
import { DateRange, Period, ReportKind } from './admin_report_schedule';
import { MAX_NOTIFICATION_TITLE_LENGTH } from './notification';
import { UiLanguage } from './preferences';

export type Trend = 'GOOD' | 'BAD' | 'STABLE' | 'NO_DATA';

export interface TrendResult { trend: Trend; changePercent: number | null }
export interface ReportText { title: string; body: string }

export interface TranslationStats {
  totalTranslations: number;
  activeUsers30d: number;
  /** Ascendente; el ultimo es hoy (parcial). */
  daily: { date: string; count: number }[];
  /** Ascendente; la ultima semana es la actual (parcial). */
  weekly: { weekStart: string; count: number }[];
  /** Ascendente; el ultimo mes es el actual (parcial). */
  monthly: { month: string; count: number }[];
}

export interface SectionVisits { section: string; visits: number }
export interface SectionComparison { current: SectionVisits[]; previous: SectionVisits[] }
export interface SignTemplateSummary { words: number; templates: number }

export interface DigestInput {
  stats: TranslationStats;
  /** Ausente si analytics no respondio: el resumen sale sin esa linea. */
  sections?: SectionComparison;
  /** Semana cerrada del resumen semanal: limita "por dia" a esos dias. Sin ella se usan todos los de `daily`. */
  weekRange?: DateRange;
}

export const TREND_THRESHOLD_PERCENT = 10;
/** Dias con actividad sobre 7: >=5 bueno, 3-4 estable, <=2 malo. Se aplican como proporcion si hay menos dias. */
export const GOOD_ACTIVE_DAYS = 5;
export const STABLE_ACTIVE_DAYS = 3;
const DAYS_PER_WEEK = 7;

const isoDayInRange = (date: string, range: DateRange): boolean => date >= range.from && date <= range.to;

/** El ultimo periodo cerrado debe ser el que toca reportar; si la ventana de recognition no cuadra, no se reclama. */
export const statsMatchPeriod = (period: Period, stats: TranslationStats): boolean => {
  if (period.kind === 'WEEKLY') return stats.weekly[stats.weekly.length - 2]?.weekStart === period.current.from;
  if (period.kind === 'MONTHLY') return stats.monthly[stats.monthly.length - 2]?.month === period.current.from.slice(0, 7);
  return true;
};
// ---- Tendencias ----

export const compareTrend = (current: number, previous: number): TrendResult => {
  if (current === 0 && previous === 0) return { trend: 'NO_DATA', changePercent: null };
  if (previous === 0) return { trend: 'GOOD', changePercent: null };
  const change = ((current - previous) / previous) * 100;
  const trend: Trend = change >= TREND_THRESHOLD_PERCENT ? 'GOOD' : change <= -TREND_THRESHOLD_PERCENT ? 'BAD' : 'STABLE';
  return { trend, changePercent: Math.round(change) };
};

const activeDaysTrend = (activeDays: number, totalDays: number): Trend => {
  if (activeDays === 0) return 'NO_DATA';
  const share = activeDays / totalDays;
  if (share >= GOOD_ACTIVE_DAYS / DAYS_PER_WEEK) return 'GOOD';
  return share >= STABLE_ACTIVE_DAYS / DAYS_PER_WEEK ? 'STABLE' : 'BAD';
};

const toneOf = (trends: Trend[]): Tone => {
  if (trends.every(trend => trend === 'NO_DATA')) return 'SILENT';
  const balance = trends.filter(t => t === 'GOOD').length - trends.filter(t => t === 'BAD').length;
  if (balance > 0) return 'CELEBRATE';
  return balance < 0 ? 'ALERT' : 'NEUTRAL';
};

// ---- Formato ----

const signedPercent = (change: number | null): string | null => {
  if (change === null) return null;
  return `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change)}%`;
};

const withChange = (title: string, change: string | null): string => {
  const text = change ? `${title} (${change})` : title;
  return Array.from(text).slice(0, MAX_NOTIFICATION_TITLE_LENGTH).join('');
};

const numberFormatter = (messages: ReportMessages) => (value: number): string => value.toLocaleString(messages.locale);

/** Penultimo y antepenultimo elemento: el ultimo periodo cerrado y el anterior. */
const closedAndPrevious = <T>(series: T[]): { closed: T; previous: T } => ({
  closed: series[series.length - 2],
  previous: series[series.length - 3],
});

// ---- Secciones ----

interface SectionFacts {
  trend: TrendResult;
  top: SectionVisits;
  lowest: SectionVisits | null;
  /** Secciones que tenian visitas el periodo anterior y ahora ninguna. */
  dropped: string[];
}

const sumVisits = (sections: SectionVisits[]): number => sections.reduce((total, s) => total + s.visits, 0);

const analyzeSections = (comparison?: SectionComparison): SectionFacts | null => {
  const visited = (comparison?.current ?? []).filter(s => s.visits > 0);
  if (!comparison || visited.length === 0) return null;
  const byVisits = [...visited].sort((a, b) => b.visits - a.visits);
  const top = byVisits[0];
  const lowest = byVisits.length > 1 ? byVisits[byVisits.length - 1] : null;
  const stillVisited = new Set(visited.map(s => s.section));
  return {
    trend: compareTrend(sumVisits(comparison.current), sumVisits(comparison.previous)),
    top,
    lowest,
    dropped: comparison.previous.filter(s => s.visits > 0 && !stillVisited.has(s.section)).map(s => s.section),
  };
};

const sectionLines = (facts: SectionFacts | null, messages: ReportMessages, format: (n: number) => string): string[] => {
  if (!facts) return [];
  const label = (section: string): string => messages.sections[section] ?? section;
  const highlight = (s: SectionVisits): SectionHighlight => ({ name: label(s.section), visits: format(s.visits) });
  const lines = [messages.sectionsLine(highlight(facts.top), facts.lowest && highlight(facts.lowest), signedPercent(facts.trend.changePercent))];
  if (facts.dropped.length > 0) lines.push(messages.sectionsDropped(facts.dropped.map(label).join(', ')));
  return lines;
};

// ---- Resumenes ----

const bestDayOf = (daily: TranslationStats['daily'], messages: ReportMessages, format: (n: number) => string): BestDay | null => {
  const best = daily.reduce((top, day) => (day.count > top.count ? day : top), daily[0]);
  if (!best || best.count === 0) return null;
  const weekday = new Date(`${best.date}T00:00:00Z`).getUTCDay();
  return { day: messages.weekdays[weekday], count: format(best.count) };
};

export const buildWeeklyDigest = (input: DigestInput, language: UiLanguage): ReportText => {
  const messages = messagesFor(language);
  const format = numberFormatter(messages);
  const { weekly } = input.stats;
  const { weekRange } = input;
  const daily = weekRange ? input.stats.daily.filter(day => isoDayInRange(day.date, weekRange)) : input.stats.daily;
  const activeDays = daily.filter(day => day.count > 0).length;
  const { closed, previous } = closedAndPrevious(weekly);
  const volume = compareTrend(closed.count, previous.count);
  const sections = analyzeSections(input.sections);
  const change = signedPercent(volume.changePercent);
  const tone = toneOf([...(daily.length > 0 ? [activeDaysTrend(activeDays, daily.length)] : []), volume.trend, ...(sections ? [sections.trend.trend] : [])]);

  return {
    title: withChange(messages.weeklyTitle[tone], tone === 'SILENT' ? null : change),
    body: [
      ...(daily.length > 0
        ? [messages.activeDays(format(activeDays), format(daily.length), bestDayOf(daily, messages, format))]
        : []),
      messages.weeklyVolume(format(closed.count), change),
      ...sectionLines(sections, messages, format),
    ].join('\n'),
  };
};

const isRecordMonth = (monthly: TranslationStats['monthly']): boolean => {
  const closedMonths = monthly.slice(0, -1);
  const closed = closedMonths[closedMonths.length - 1];
  const bestOther = Math.max(0, ...closedMonths.slice(0, -1).map(m => m.count));
  return closed.count > bestOther && bestOther > 0;
};

export const buildMonthlyDigest = (input: DigestInput, language: UiLanguage): ReportText => {
  const messages = messagesFor(language);
  const format = numberFormatter(messages);
  const { weekly, monthly } = input.stats;
  const { closed, previous } = closedAndPrevious(monthly);
  const monthName = messages.months[Number(closed.month.slice(5, 7)) - 1];
  const volume = compareTrend(closed.count, previous.count);
  const weeks = closedAndPrevious(weekly);
  const weeksTrend = compareTrend(weeks.closed.count, weeks.previous.count);
  const sections = analyzeSections(input.sections);
  const isRecord = isRecordMonth(monthly);
  const change = signedPercent(volume.changePercent);
  const tone: MonthlyTone = isRecord
    ? 'RECORD'
    : toneOf([volume.trend, weeksTrend.trend, ...(sections ? [sections.trend.trend] : [])]);

  return {
    title: withChange(messages.monthlyTitle[tone](monthName), tone === 'SILENT' ? null : change),
    body: [
      messages.monthlyVolume(monthName, format(closed.count), change),
      messages.closedWeeks(format(weeks.closed.count), signedPercent(weeksTrend.changePercent)),
      ...sectionLines(sections, messages, format),
    ].join('\n'),
  };
};

export const buildModelReminder = (summary: SignTemplateSummary, language: UiLanguage): ReportText => {
  const messages = messagesFor(language);
  const format = numberFormatter(messages);
  return {
    title: messages.reminderTitle,
    body: messages.reminderBody(format(summary.words), format(summary.templates)),
  };
};
