import { EventPublisher } from '@traduce/shared';
import { NewUser, User } from '../../src/users/domain/entity';
import { RoleRepository, UserRepository } from '../../src/users/domain/repository';
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
