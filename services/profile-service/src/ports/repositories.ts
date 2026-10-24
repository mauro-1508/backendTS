import { ReportKind } from '../domain/admin_report_schedule';
import { AchievementMetric, AchievementProgress } from '../domain/achievement';
import { NewNotification, Notification, NotificationPage, NotificationQuery } from '../domain/notification';
import { Preferences, PreferencesPatch, Profile, UiLanguage } from '../domain/preferences';

export interface NewProfile {
  userId: string;
  email?: string;
  fullName?: string;
  username?: string;
}

export interface ProfileRepository {
  /** Crea perfil y preferencias por defecto; si ya existen no hace nada. */
  createIfAbsent(profile: NewProfile): Promise<void>;
  /** True si el usuario ya fue borrado (iam.UserDeleted): sus eventos tardios no deben recrear datos. */
  isErased(userId: string): Promise<boolean>;
  /** Borra perfil, preferencias, notificaciones y logros del usuario y lo registra como borrado. Idempotente. */
  eraseUser(userId: string): Promise<void>;
  findProfile(userId: string): Promise<Profile | null>;
  findPreferences(userId: string): Promise<Preferences | null>;
  /**
   * Recibe un patch validado, no vacío y sin valores undefined.
   * Aplica solo los campos enviados; crea preferencias con defaults si faltan.
   * Devuelve null si no existe el perfil.
   */
  updatePreferences(
    userId: string,
    patch: PreferencesPatch,
  ): Promise<Preferences | null>;
}

export interface ActivityRepository {
  recordTranslationIfNew(userId: string, translationId: number): Promise<boolean>;
  load(userId: string): Promise<import('../domain/activity').ActivityState>;
  save(userId: string, state: import('../domain/activity').ActivityState): Promise<void>;
}

export interface AchievementRepository {
  /** Logros activos de la metrica con el avance del usuario (0 si aun no tiene fila). */
  findProgressByMetric(userId: string, metric: AchievementMetric): Promise<AchievementProgress[]>;
  /** v1 preserves the five translation rules; v2 includes the new implemented measurements. */
  findAllProgress(userId: string, catalogVersion?: 1 | 2): Promise<AchievementProgress[]>;
  /** Registra la creación efectiva de la notificación del logro. */
markNotified(userId: string, achievementId: string): Promise<void>;
  saveProgress(userId: string, progress: AchievementProgress): Promise<void>;
}

export interface NotificationRepository {
  create(notification: NewNotification): Promise<boolean>;
  /** Devuelve false si el tipo no existe o está inactivo. */
  list(userId: string, query: NotificationQuery): Promise<NotificationPage>;
  markRead(userId: string, notificationId: string): Promise<Notification | null>;
}

export interface PendingEmail {
  notificationId: string;
  /** Correo del perfil; sin el no se puede enviar. */
  to?: string;
  title: string;
  body: string;
  language: UiLanguage;
  notificationsEnabled: boolean;
}

export type EmailOutcome = 'SENT' | 'FAILED' | 'CANCELLED';

export interface EmailOutbox {
  /**
   * Bloquea hasta `limit` avisos EMAIL PENDING con scheduled_at vencido (sin esperar a los que tenga
   * otra instancia), aplica `deliver` a cada uno y guarda su estado. Devuelve cuantos proceso.
   */
  processDue(limit: number, deliver: (email: PendingEmail) => Promise<EmailOutcome>): Promise<number>;
}

export interface ProcessedEventRepository {
  /** Registra el evento; devuelve false si ya estaba registrado. */
  markIfNew(eventId: string): Promise<boolean>;
}

/** Bloqueos disponibles dentro de la unidad de trabajo. */
export interface GamificationLocks {
  /** Serializa las actualizaciones del usuario hasta commit o rollback. */
  lockUser(userId: string): Promise<void>;
}


export interface AdminRecipient {
  userId: string;
  uiLanguage: UiLanguage;
}

export interface AdminRecipientRepository {
  /** Registra al usuario como ADMIN visto (con limite de escrituras) o lo quita si ya no lo es. */
  touch(userId: string, isAdmin: boolean): Promise<void>;
  /** Admins vistos por profile con perfil vigente y notificaciones activadas (respaldo si iam no responde). */
  listActive(): Promise<AdminRecipient[]>;
  /** De los ids dados (admins segun iam), los que tienen perfil vigente y notificaciones activadas. */
  listEnabled(userIds: readonly string[]): Promise<AdminRecipient[]>;
}

export interface ReportRunRepository {
  /** Reserva el periodo; devuelve el id de la ejecucion o null si otro ya lo reservo. */
  claim(kind: ReportKind, periodKey: string): Promise<string | null>;
}

/** Consulta fuera de la transaccion: evita pedir estadisticas de un periodo que ya se envio. */
export interface ReportRunQuery {
  isClaimed(kind: ReportKind, periodKey: string): Promise<boolean>;
}

/** Repositorios que comparten una misma transaccion. */
export interface TransactionalRepositories {
  profiles: ProfileRepository;
  achievements: AchievementRepository;
  notifications: NotificationRepository;
  processedEvents: ProcessedEventRepository;
  gamificationLocks: GamificationLocks;
  reportRuns: ReportRunRepository;
  activity?: ActivityRepository;
}

export interface UnitOfWork {
  run<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T>;
}
