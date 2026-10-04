export const UI_LANGUAGES = ['ES', 'EN'] as const;
export const THEMES = ['LIGHT', 'DARK'] as const;

export type UiLanguage = (typeof UI_LANGUAGES)[number];
export type Theme = (typeof THEMES)[number];

export interface Preferences {
  uiLanguage: UiLanguage;
  theme: Theme;
  notificationsEnabled: boolean;
  updatedAt?: string;
}

export type PreferencesPatch = Partial<Pick<Preferences, 'uiLanguage' | 'theme' | 'notificationsEnabled'>>;

/** Un usuario sin fila de preferencias es valido: se usan los valores por defecto. */
export const DEFAULT_PREFERENCES: Preferences = {
  uiLanguage: 'ES',
  theme: 'LIGHT',
  notificationsEnabled: true,
};

export interface Profile {
  userId: string;
  fullName: string;
  username?: string;
  email?: string;
  preferences: Preferences;
}
