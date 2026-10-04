/** Error de negocio con su codigo HTTP; el controlador lo traduce a respuesta. */
export class ProfileError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
  }
}

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

export const validationError = (message: string) => new ProfileError('VALIDATION_ERROR', message, HTTP_BAD_REQUEST);
export const notFoundError = (message: string) => new ProfileError('NOT_FOUND', message, HTTP_NOT_FOUND);
