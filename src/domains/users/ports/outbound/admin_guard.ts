/** Pregunta a IAM si el usuario es el unico ADMIN. Lo cablea cmd/server/main.ts. */
export interface AdminGuard {
  isLastAdmin(userId: number): Promise<boolean>;
}
