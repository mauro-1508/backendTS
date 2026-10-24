import {
  buildModelReminder, buildMonthlyDigest, buildWeeklyDigest, DigestInput, ReportText, statsMatchPeriod,
} from '../domain/admin_report';
import { dueReports, Period, periodOf, ReportKind } from '../domain/admin_report_schedule';
import {
  ADMIN_MODEL_REMINDER_TYPE_CODE, ADMIN_MONTHLY_REPORT_TYPE_CODE, ADMIN_WEEKLY_REPORT_TYPE_CODE, DeliveryChannel,
} from '../domain/notification';
import { UiLanguage } from '../domain/preferences';
import { AdminDirectory } from '../ports/admin_directory';
import { Logger } from '../ports/logger';
import {
  AdminRecipient, AdminRecipientRepository, ReportRunQuery, UnitOfWork,
} from '../ports/repositories';
import { StatsGateway } from '../ports/stats_gateway';

export interface ReportOutcome { kind: ReportKind; periodKey: string; notified: number }

type ReportBuilder = (language: UiLanguage) => ReportText;

const TYPE_CODE_BY_KIND: Record<ReportKind, string> = {
  WEEKLY: ADMIN_WEEKLY_REPORT_TYPE_CODE,
  MONTHLY: ADMIN_MONTHLY_REPORT_TYPE_CODE,
  MODEL_REMINDER: ADMIN_MODEL_REMINDER_TYPE_CODE,
};

/**
 * Envia a los admins los resumenes y recordatorios que ya tocan. Los datos se leen antes de abrir la
 * transaccion; dentro, reservar el periodo y crear las notificaciones es todo-o-nada, asi que
 * repetir la ejecucion (o dos instancias a la vez) no duplica avisos.
 */
export const makeRunAdminReports = (deps: {
  stats: StatsGateway;
  recipients: AdminRecipientRepository;
  /** Lista de admins de iam; sin ella (o si falla) se usan los admins que profile ya vio. */
  directory?: AdminDirectory;
  reportRuns: ReportRunQuery;
  unitOfWork: UnitOfWork;
  logger: Logger;
  /** Un aviso por canal y admin; EMAIL lo envia el worker de correo (ADR-007). */
  channels?: readonly DeliveryChannel[];
  now?: () => Date;
}) => {
  const now = deps.now ?? (() => new Date());
  const channels = deps.channels ?? ['IN_APP'];

  // Todos los admins de iam con el interruptor encendido, hayan entrado o no a la app.
  const loadAdmins = async (): Promise<AdminRecipient[]> => {
    if (!deps.directory) return deps.recipients.listActive();
    try {
      return await deps.recipients.listEnabled(await deps.directory.listAdminIds());
    } catch (error) {
      deps.logger.error('[profile] iam no disponible, se avisa a los admins ya conocidos', error);
      return deps.recipients.listActive();
    }
  };

  // Si analytics falla el resumen sale sin la linea de secciones.
  const loadSections = async (period: Period) => {
    try {
      const [current, previous] = await Promise.all([
        deps.stats.sectionVisits(period.current),
        deps.stats.sectionVisits(period.previous),
      ]);
      return { current, previous };
    } catch (error) {
      deps.logger.error('[profile] analytics no disponible, resumen sin secciones', error);
      return undefined;
    }
  };

  const digestInputFor = async (period: Period): Promise<DigestInput> => {
    const [stats, sections] = await Promise.all([deps.stats.translationStats(), loadSections(period)]);
    if (!statsMatchPeriod(period, stats)) {
      throw new Error(`las estadisticas de recognition no coinciden con el periodo ${period.periodKey}`);
    }
    return { stats, sections, weekRange: period.current };
  };

  const builders: Record<ReportKind, (period: Period) => Promise<ReportBuilder>> = {
    WEEKLY: async period => {
      const input = await digestInputFor(period);
      return language => buildWeeklyDigest(input, language);
    },
    MONTHLY: async period => {
      const input = await digestInputFor(period);
      return language => buildMonthlyDigest(input, language);
    },
    MODEL_REMINDER: async () => {
      const summary = await deps.stats.signTemplateSummary();
      return language => buildModelReminder(summary, language);
    },
  };

  const deliver = (period: Period, admins: AdminRecipient[], build: ReportBuilder): Promise<ReportOutcome | null> =>
    deps.unitOfWork.run(async repositories => {
      const runId = await repositories.reportRuns.claim(period.kind, period.periodKey);
      if (!runId) return null;
      let notified = 0;
      for (const admin of admins) {
        // Mismo bloqueo que la baja de cuenta: no se notifica a quien se esta borrando.
        await repositories.gamificationLocks.lockUser(admin.userId);
        if (await repositories.profiles.isErased(admin.userId)) continue;
        const text = build(admin.uiLanguage);
        let reached = false;
        for (const channel of channels) {
          const created = await repositories.notifications.create({
            userId: admin.userId,
            typeCode: TYPE_CODE_BY_KIND[period.kind],
            channel,
            ...text,
            referenceType: 'ADMIN_REPORT',
            referenceId: runId,
          });
          reached = reached || created;
        }
        if (reached) notified += 1;
      }
      // Sin ningun aviso creado se deshace el reclamo: el periodo no se quema y se reintenta.
      if (notified === 0) throw new Error(`el reporte ${period.kind} ${period.periodKey} no notifico a ningun admin`);
      return { kind: period.kind, periodKey: period.periodKey, notified };
    });

  const runOne = async (kind: ReportKind, admins: AdminRecipient[]): Promise<ReportOutcome | null> => {
    const period = periodOf(kind, now());
    if (await deps.reportRuns.isClaimed(kind, period.periodKey)) return null;
    return deliver(period, admins, await builders[kind](period));
  };

  /** Cada reporte falla por separado: si recognition cae, el periodo no se reclama y se reintenta. */
  return async (): Promise<ReportOutcome[]> => {
    const due = dueReports(now());
    if (due.length === 0) return [];
    const admins = await loadAdmins();
    if (admins.length === 0) return [];
    const outcomes: ReportOutcome[] = [];
    for (const kind of due) {
      try {
        const outcome = await runOne(kind, admins);
        if (outcome) outcomes.push(outcome);
      } catch (error) {
        deps.logger.error(`[profile] no se pudo generar el reporte ${kind}`, error);
      }
    }
    return outcomes;
  };
};
