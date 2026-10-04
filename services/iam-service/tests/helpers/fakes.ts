import { EventPublisher } from '@traduce/shared';
import { NewUser, User } from '../../src/users/domain/entity';
import { RoleRepository, UserRepository } from '../../src/users/domain/repository';
import { PasswordResetToken } from '../../src/auth/domain/entity';
import { AuthRepository } from '../../src/auth/domain/repository';
import { PasswordHasher } from '../../src/auth/ports/outbound/auth_provider';

/** Repositorios y servicios falsos en memoria que implementan los puertos de iam. */
export class FakeUserRepository implements UserRepository {
  users: User[] = [];
  private nextId = 1;

  async findByEmail(email: string) { return this.users.find(u => u.email === email) ?? null; }
  async findById(userId: number) { return this.users.find(u => u.userId === userId) ?? null; }
  async create({ name, email, password }: NewUser) {
    const user: User = {
      userId: this.nextId++, name, email, password,
      termsAccepted: true, termsAcceptedAt: new Date(), createdAt: new Date(),
    };
    this.users.push(user);
    return user;
  }
  async updatePassword(userId: number, hashedPassword: string) {
    const user = this.users.find(u => u.userId === userId);
    if (user) user.password = hashedPassword;
  }
}

export class FakeRoleRepository implements RoleRepository {
  rolesByUser = new Map<number, string[]>();
  async findRoleNamesByUserId(userId: number) { return this.rolesByUser.get(userId) ?? []; }
  async assignRole(userId: number, roleName: string) {
    this.rolesByUser.set(userId, [...(this.rolesByUser.get(userId) ?? []), roleName]);
  }
}

export const fakePasswordHasher: PasswordHasher = {
  hash: async plain => `hash:${plain}`,
  compare: async (plain, hashed) => hashed === `hash:${plain}`,
};

export class RecordingEventPublisher implements EventPublisher {
  published: Array<{ type: string; payload: unknown }> = [];
  async publish(type: string, payload: unknown) { this.published.push({ type, payload }); }
}

export const failingEventPublisher: EventPublisher = {
  publish: async () => { throw new Error('broker caido'); },
};

export class FakeAuthRepository implements AuthRepository {
  tokens: PasswordResetToken[] = [];
  private nextId = 1;

  async createResetToken({ userId, tokenHash, expiresAt }: { userId: number; tokenHash: string; expiresAt: Date }) {
    const token: PasswordResetToken = { tokenId: this.nextId++, userId, tokenHash, expiresAt, usedAt: null, attempts: 0 };
    this.tokens.push(token);
    return { tokenId: token.tokenId };
  }
  async findActiveResetToken(userId: number) {
    const active = this.tokens.filter(t => t.userId === userId && !t.usedAt);
    return active[active.length - 1] ?? null;
  }
  async registerFailedAttempt(tokenId: number) {
    const token = this.tokens.find(t => t.tokenId === tokenId);
    if (token) token.attempts++;
  }
  async markTokenAsUsed(tokenId: number) {
    const token = this.tokens.find(t => t.tokenId === tokenId);
    if (token) token.usedAt = new Date();
  }
  async invalidateResetTokens(userId: number) {
    this.tokens.filter(t => t.userId === userId && !t.usedAt).forEach(t => { t.usedAt = new Date(); });
  }
}

export class RecordingMailer {
  sent: Array<{ to: string; subject: string; html: string }> = [];
  async sendMail(mail: { to: string; subject: string; html: string }) { this.sent.push(mail); }
  /** El codigo de 6 digitos del ultimo correo enviado. */
  lastCode(): string {
    return /<h1[^>]*>(\d{6})<\/h1>/.exec(this.sent[this.sent.length - 1].html)![1];
  }
}
