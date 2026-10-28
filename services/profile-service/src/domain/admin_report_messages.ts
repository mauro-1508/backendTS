import { UiLanguage } from './preferences';

export type Tone = 'CELEBRATE' | 'ALERT' | 'NEUTRAL' | 'SILENT';
export type MonthlyTone = Tone | 'RECORD';

export interface BestDay { day: string; count: string }
export interface SectionHighlight { name: string; visits: string }

/** Textos de un idioma. Los numeros llegan ya formateados; `change` es un porcentaje con signo o null. */
export interface ReportMessages {
  locale: string;
  /** Domingo primero, como Date.getUTCDay(). */
  weekdays: string[];
  months: string[];
  sections: Record<string, string>;
  weeklyTitle: Record<Tone, string>;
  monthlyTitle: Record<MonthlyTone, (month: string) => string>;
  activeDays: (active: string, total: string, best: BestDay | null) => string;
  weeklyVolume: (count: string, change: string | null) => string;
  monthlyVolume: (month: string, count: string, change: string | null) => string;
  closedWeeks: (count: string, change: string | null) => string;
  sectionsLine: (top: SectionHighlight, lowest: SectionHighlight | null, change: string | null) => string;
  sectionsDropped: (names: string) => string;
  reminderTitle: string;
  reminderBody: (words: string, templates: string) => string;
}

const es: ReportMessages = {
  locale: 'es-CO',
  weekdays: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  sections: {
    HOME: 'Inicio', TRANSLATION: 'Traducción', ALPHABET: 'Alfabeto', LEXICON: 'Léxico', HISTORY: 'Historial',
    PROFILE: 'Perfil', SETTINGS: 'Ajustes', NOTIFICATIONS: 'Notificaciones', ACHIEVEMENTS: 'Logros', ADMIN: 'Administración',
  },
  weeklyTitle: {
    CELEBRATE: 'Las traducciones subieron esta semana',
    ALERT: 'Ojo: esta semana bajó la actividad',
    NEUTRAL: 'Tu resumen semanal está listo',
    SILENT: 'Semana silenciosa: nadie tradujo nada',
  },
  monthlyTitle: {
    RECORD: month => `¡Mes récord! ${month} fue el mejor de los últimos 11 meses`,
    CELEBRATE: month => `${month} cerró en alza`,
    ALERT: month => `${month} cerró con menos actividad`,
    NEUTRAL: month => `El resumen de ${month} está listo`,
    SILENT: month => `${month} fue un mes silencioso`,
  },
  activeDays: (active, total, best) => best
    ? `Por día: ${active} de ${total} días con traducciones; el mejor fue el ${best.day} (${best.count}).`
    : `Por día: ${active} de ${total} días con traducciones.`,
  weeklyVolume: (count, change) =>
    `Volumen: ${count} traducciones${change ? `, ${change} frente a la semana anterior` : ''}.`,
  monthlyVolume: (month, count, change) =>
    `${month} cerró con ${count} traducciones${change ? ` (${change} frente al mes anterior)` : ''}.`,
  closedWeeks: (count, change) =>
    `Última semana cerrada: ${count} traducciones${change ? `, ${change} frente a la anterior` : ''}.`,
  sectionsLine: (top, lowest, change) =>
    `Secciones: ${top.name} lidera con ${top.visits} visitas`
    + `${lowest ? `; ${lowest.name} es la menos visitada (${lowest.visits})` : ''}`
    + `${change ? `; visitas totales ${change}` : ''}.`,
  sectionsDropped: names => `Sin visitas en este periodo: ${names}.`,
  reminderTitle: '¡Entrena al traductor!',
  reminderBody: (words, templates) =>
    `El modelo reconoce ${words} palabras (${templates} plantillas). Cada seña nueva amplía lo que tus usuarios pueden decir. Agrega una esta semana.`,
};

const en: ReportMessages = {
  locale: 'en-US',
  weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  sections: {
    HOME: 'Home', TRANSLATION: 'Translation', ALPHABET: 'Alphabet', LEXICON: 'Lexicon', HISTORY: 'History',
    PROFILE: 'Profile', SETTINGS: 'Settings', NOTIFICATIONS: 'Notifications', ACHIEVEMENTS: 'Achievements', ADMIN: 'Administration',
  },
  weeklyTitle: {
    CELEBRATE: 'Translations went up this week',
    ALERT: 'Heads up: activity dropped this week',
    NEUTRAL: 'Your weekly summary is ready',
    SILENT: 'Quiet week: nobody translated anything',
  },
  monthlyTitle: {
    RECORD: month => `Record month! ${month} was the best of the last 11 months`,
    CELEBRATE: month => `${month} closed on the rise`,
    ALERT: month => `${month} closed with less activity`,
    NEUTRAL: month => `The ${month} summary is ready`,
    SILENT: month => `${month} was a quiet month`,
  },
  activeDays: (active, total, best) => best
    ? `Per day: ${active} of ${total} days with translations; the best was ${best.day} (${best.count}).`
    : `Per day: ${active} of ${total} days with translations.`,
  weeklyVolume: (count, change) =>
    `Volume: ${count} translations${change ? `, ${change} versus the previous week` : ''}.`,
  monthlyVolume: (month, count, change) =>
    `${month} closed with ${count} translations${change ? ` (${change} versus the previous month)` : ''}.`,
  closedWeeks: (count, change) =>
    `Last closed week: ${count} translations${change ? `, ${change} versus the one before` : ''}.`,
  sectionsLine: (top, lowest, change) =>
    `Sections: ${top.name} leads with ${top.visits} visits`
    + `${lowest ? `; ${lowest.name} is the least visited (${lowest.visits})` : ''}`
    + `${change ? `; total visits ${change}` : ''}.`,
  sectionsDropped: names => `No visits in this period: ${names}.`,
  reminderTitle: 'Train the translator!',
  reminderBody: (words, templates) =>
    `The model recognizes ${words} words (${templates} templates). Every new sign widens what your users can say. Add one this week.`,
};

const fr: ReportMessages = {
  locale: 'fr-FR',
  weekdays: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  months: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  sections: {
    HOME: 'Accueil', TRANSLATION: 'Traduction', ALPHABET: 'Alphabet', LEXICON: 'Lexique', HISTORY: 'Historique',
    PROFILE: 'Profil', SETTINGS: 'Paramètres', NOTIFICATIONS: 'Notifications', ACHIEVEMENTS: 'Succès', ADMIN: 'Administration',
  },
  weeklyTitle: {
    CELEBRATE: 'Les traductions ont augmenté cette semaine',
    ALERT: 'Attention : l’activité a baissé cette semaine',
    NEUTRAL: 'Votre résumé hebdomadaire est prêt',
    SILENT: 'Semaine silencieuse : personne n’a traduit',
  },
  monthlyTitle: {
    RECORD: month => `Mois record ! ${month} est le meilleur des 11 derniers mois`,
    CELEBRATE: month => `${month} s’est terminé en hausse`,
    ALERT: month => `${month} s’est terminé avec moins d’activité`,
    NEUTRAL: month => `Le résumé de ${month} est prêt`,
    SILENT: month => `${month} a été un mois silencieux`,
  },
  activeDays: (active, total, best) => best
    ? `Par jour : ${active} jours sur ${total} avec des traductions ; le meilleur était ${best.day} (${best.count}).`
    : `Par jour : ${active} jours sur ${total} avec des traductions.`,
  weeklyVolume: (count, change) =>
    `Volume : ${count} traductions${change ? `, ${change} par rapport à la semaine précédente` : ''}.`,
  monthlyVolume: (month, count, change) =>
    `${month} s’est terminé avec ${count} traductions${change ? ` (${change} par rapport au mois précédent)` : ''}.`,
  closedWeeks: (count, change) =>
    `Dernière semaine terminée : ${count} traductions${change ? `, ${change} par rapport à la précédente` : ''}.`,
  sectionsLine: (top, lowest, change) =>
    `Sections : ${top.name} en tête avec ${top.visits} visites`
    + `${lowest ? ` ; ${lowest.name} est la moins visitée (${lowest.visits})` : ''}`
    + `${change ? ` ; visites totales ${change}` : ''}.`,
  sectionsDropped: names => `Aucune visite sur la période : ${names}.`,
  reminderTitle: 'Entraînez le traducteur !',
  reminderBody: (words, templates) =>
    `Le modèle reconnaît ${words} mots (${templates} modèles). Chaque nouveau signe élargit ce que vos utilisateurs peuvent dire. Ajoutez-en un cette semaine.`,
};

const pt: ReportMessages = {
  locale: 'pt-BR',
  weekdays: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
  months: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
  sections: {
    HOME: 'Início', TRANSLATION: 'Tradução', ALPHABET: 'Alfabeto', LEXICON: 'Léxico', HISTORY: 'Histórico',
    PROFILE: 'Perfil', SETTINGS: 'Configurações', NOTIFICATIONS: 'Notificações', ACHIEVEMENTS: 'Conquistas', ADMIN: 'Administração',
  },
  weeklyTitle: {
    CELEBRATE: 'As traduções aumentaram esta semana',
    ALERT: 'Atenção: a atividade caiu esta semana',
    NEUTRAL: 'Seu resumo semanal está pronto',
    SILENT: 'Semana silenciosa: ninguém traduziu nada',
  },
  monthlyTitle: {
    RECORD: month => `Mês recorde! ${month} foi o melhor dos últimos 11 meses`,
    CELEBRATE: month => `${month} fechou em alta`,
    ALERT: month => `${month} fechou com menos atividade`,
    NEUTRAL: month => `O resumo de ${month} está pronto`,
    SILENT: month => `${month} foi um mês silencioso`,
  },
  activeDays: (active, total, best) => best
    ? `Por dia: ${active} de ${total} dias com traduções; o melhor foi ${best.day} (${best.count}).`
    : `Por dia: ${active} de ${total} dias com traduções.`,
  weeklyVolume: (count, change) =>
    `Volume: ${count} traduções${change ? `, ${change} em relação à semana anterior` : ''}.`,
  monthlyVolume: (month, count, change) =>
    `${month} fechou com ${count} traduções${change ? ` (${change} em relação ao mês anterior)` : ''}.`,
  closedWeeks: (count, change) =>
    `Última semana fechada: ${count} traduções${change ? `, ${change} em relação à anterior` : ''}.`,
  sectionsLine: (top, lowest, change) =>
    `Seções: ${top.name} lidera com ${top.visits} visitas`
    + `${lowest ? `; ${lowest.name} é a menos visitada (${lowest.visits})` : ''}`
    + `${change ? `; visitas totais ${change}` : ''}.`,
  sectionsDropped: names => `Sem visitas neste período: ${names}.`,
  reminderTitle: 'Treine o tradutor!',
  reminderBody: (words, templates) =>
    `O modelo reconhece ${words} palavras (${templates} modelos). Cada sinal novo amplia o que seus usuários podem dizer. Adicione um esta semana.`,
};

export const REPORT_MESSAGES: Record<UiLanguage, ReportMessages> = { ES: es, EN: en, FR: fr, PT: pt };

/** ES como respaldo si llega un idioma sin textos. */
export const messagesFor = (language: UiLanguage): ReportMessages => REPORT_MESSAGES[language] ?? es;
