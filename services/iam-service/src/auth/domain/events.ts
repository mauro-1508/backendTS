/** Eventos que iam publica (routing keys `<servicio>.<Evento>`). */
export const IAM_EVENTS = {
  UserRegistered: 'iam.UserRegistered',
} as const;

export interface UserRegisteredPayload {
  userId: number;
  email: string;
  name: string;
}
