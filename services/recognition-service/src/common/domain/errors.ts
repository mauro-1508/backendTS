/** La cuenta ya fue borrada (iam.UserDeleted): un JWT aun vigente no debe crear datos nuevos. */
export class AccountErasedError extends Error {
  constructor() {
    super('La cuenta fue eliminada');
  }
}
