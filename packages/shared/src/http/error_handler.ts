import { NextFunction, Request, Response } from 'express';

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
};
