export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

export interface User {
  userId: number;
  name: string;
  email: string;
  password: string | null;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  termsAccepted: boolean;
  termsAcceptedAt: Date | null;
  createdAt: Date;
}

export interface NewUser {
  name: string;
  email: string;
  password: string | null;

  /** Por defecto INACTIVE (pendiente de verificar el correo). */
  status?: UserStatus;
  emailVerifiedAt?: Date | null;
}
