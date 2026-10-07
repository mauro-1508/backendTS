import { RequestHandler } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { matchesAnyPrefix, ROUTE_PREFIXES, SERVICE_NAMES, ServiceName } from './route_table';

interface JsonResponse {
  headersSent?: boolean;
  status?: (code: number) => { json: (body: unknown) => void };
}

const sendBadGateway = (service: ServiceName, res: unknown) => {
  const response = res as JsonResponse;
  if (response.headersSent || !response.status) return;
  response.status(502).json({
    success: false,
    code: 'BAD_GATEWAY',
    message: `El servicio ${service} no está disponible`,
  });
};

/**
 * Un proxy por servicio, montado en la raiz: conserva la ruta completa
 * (`/api/lexicon/...`) y deja pasar solo los prefijos que le tocan.
 */
export const makeServiceProxies = (serviceUrls: Record<ServiceName, string>): RequestHandler[] =>
  SERVICE_NAMES.map(service =>
    createProxyMiddleware({
      target: serviceUrls[service],
      changeOrigin: true,
      pathFilter: (path: string) => matchesAnyPrefix(path, ROUTE_PREFIXES[service]),
      on: {
        error: (error, _req, res) => {
          console.error(`[gateway] ${service}:`, (error as Error).message);
          sendBadGateway(service, res);
        },
      },
    }) as RequestHandler,
  );
