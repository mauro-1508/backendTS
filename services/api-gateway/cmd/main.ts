import 'dotenv/config';
import { makeJwtTokenProvider } from '@traduce/shared';
import { makeGatewayApp } from '../src/app';
import { loadGatewayConfig } from '../src/config';

const config = loadGatewayConfig();
const tokenProvider = makeJwtTokenProvider({ secret: config.jwtSecret, expiresIn: config.jwtExpiresIn });

const server = makeGatewayApp({ config, tokenProvider }).listen(config.port, () => {
  console.log(`API Gateway escuchando en el puerto ${config.port}`);
});

process.on('SIGTERM', () => {
  server.close();
});
