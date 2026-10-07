import { AchievementMetric, AchievementProgress } from '../domain/achievement';
import { NewNotification, Notification, NotificationPage, NotificationQuery } from '../domain/notification';
import { Preferences, PreferencesPatch, Profile } from '../domain/preferences';

export interface NewProfile {
  userId: string;
  email?: string;
  fullName?: string;
  username?: string;
}

export interface ProfileRepository {
  /** Crea perfil y preferencias por defecto; si ya existen no hace nada. */
  createIfAbsent(profile: NewProfile): Promise<void>;
  findProfile(userId: string): Promise<Profile | null>;
  findPreferences(userId: string): Promise<Preferences | null>;
  /** Aplica el cambio; devuelve null si el usuario no tiene preferencias. */
  updatePreferences(userId: string, patch: PreferencesPatch): Promise<Preferences | null>;
}

export interface AchievementRepository {
  /** Logros activos de la metrica con el avance del usuario (0 si aun no tiene fila). */
  findProgressByMetric(userId: string, metric: AchievementMetric): Promise<AchievementProgress[]>;
  /** Todos los logros activos con el avance del usuario. */
  findAllProgress(userId: string): Promise<AchievementProgress[]>;
  saveProgress(userId: string, progress: AchievementProgress): Promise<void>;
}

export interface NotificationRepository {
  create(notification: NewNotification): Promise<void>;
  list(userId: string, query: NotificationQuery): Promise<NotificationPage>;
  markRead(userId: string, notificationId: string): Promise<Notification | null>;
}

export interface ProcessedEventRepository {
  /** Registra el evento; devuelve false si ya estaba registrado. */
  markIfNew(eventId: string): Promise<boolean>;
}

/** Repositorios que comparten una misma transaccion. */
export interface TransactionalRepositories {
  profiles: ProfileRepository;
  achievements: AchievementRepository;
  notifications: NotificationRepository;
  processedEvents: ProcessedEventRepository;
}

export interface UnitOfWork {
  run<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T>;
}
