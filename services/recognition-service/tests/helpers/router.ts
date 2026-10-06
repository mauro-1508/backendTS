import { Response } from 'express';
import { makeAuthMiddleware, makeJwtTokenProvider } from '@traduce/shared';

export const tokenProvider = makeJwtTokenProvider({ secret: 'secreto-recognition-stats', expiresIn: '1h' });
export const authMiddleware = makeAuthMiddleware(tokenProvider);

/** Cabecera Authorization con un JWT real firmado con roles y permisos dados. */
export const bearerFor = (permissions: string[] = [], roles: string[] = ['USER'], userId = 7) => ({
  authorization: `Bearer ${tokenProvider.sign({ userId, email: 'a@b.c', roles, permissions })}`,
});

/** Ejecuta un router de Express sin red y espera a que responda (los handlers son asincronos). */
export const callRouter = (router: unknown, url: string, headers: Record<string, string>) =>
  new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const out = { status: 200, body: undefined as unknown };
    const res = {
      status: (s: number) => { out.status = s; return res; },
      json: (b: unknown) => { out.body = b; resolve(out); return res; },
    };
    (router as { handle: (...a: unknown[]) => void }).handle(
      { method: 'GET', url, headers, query: {}, body: {} },
      res as unknown as Response,
      (e?: unknown) => reject(e ?? new Error('next')),
    );
  });
