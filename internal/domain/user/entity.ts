export interface User {
  userId: number;
  name: string;
  email: string;
  password: string | null;
  termsAccepted: boolean;
  termsAcceptedAt: Date | null;
  createdAt: Date;
}

export interface NewUser {
  name: string;
  email: string;
  password: string | null;
}
