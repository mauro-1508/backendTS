import 'dotenv/config';
import { MongoClient } from 'mongodb';
import {
  createEventBus, loadConfig, makeAuthMiddleware, makeConsumerRetryCheck, makeDeadLetterCheck, makeJwtTokenProvider, makePgPool,
  makeRetryMonitor, requireRole,
} from '@traduce/shared';
import { makeRecognitionModule } from '../src/recognition.module';
import { loadRecognitionConfig } from '../src/config';
import { InMemorySampleRepository } from '../src/samples/adapters/outbound/memory/in_memory_sample_repository';
import {
  ensureSampleIndexes, GESTURE_SAMPLES_COLLECTION, makeMongoSampleRepository, SampleDocument,
} from '../src/samples/adapters/outbound/mongo/mongo_sample_repository';
import { SampleRepository } from '../src/samples/ports/outbound/sample_repository';
import { startRetentionScheduler } from '../src/translations/adapters/inbound/scheduler/retention_scheduler';

const RECOGNITION_DEFAULT_PORT = 3002;
const ADMIN_ROLE = 'ADMIN';
// La retencion se mide en dias: con una vuelta cada 6 horas nada pasa mas de un cuarto de dia de su fecha.
const RETENTION_TICK_MS = 6 * 60 * 60 * 1000;

const config = loadConfig({ prefix: 'RECOGNITION', defaultPort: RECOGNITION_DEFAULT_PORT });
const { mongoUrl, translationRetentionDays } = loadRecognitionConfig();
const pool = makePgPool(config.db);
const eventBus = createEventBus(config.rabbitmqUrl);
const tokenProvider = makeJwtTokenProvider(config.jwt);
const retryMonitor = makeRetryMonitor();
const mongoClient = mongoUrl ? new MongoClient(mongoUrl) : null;

const makeSampleRepository = async (): Promise<SampleRepository> => {
  if (!mongoClient) {
    console.warn('[recognition] MONGO_URL vacio: las muestras se guardan en memoria');
    return new InMemorySampleRepository();
  }
  await mongoClient.connect();
  const collection = mongoClient.db().collection<SampleDocument>(GESTURE_SAMPLES_COLLECTION);
  await ensureSampleIndexes(collection);
  return makeMongoSampleRepository(collection);
};

const start = async () => {
  const sampleRepository = await makeSampleRepository();
  const { app, subscribe, jobs } = makeRecognitionModule({
    pool,
    eventBus,
    sampleRepository,
    authMiddleware: makeAuthMiddleware(tokenProvider),
    requireAdmin: requireRole(ADMIN_ROLE),
    translationRetentionDays,
    retryMonitor,
    healthChecks: { dead_letters: makeDeadLetterCheck(eventBus), consumer_retrying: makeConsumerRetryCheck(retryMonitor) },
  });

  const server = app.listen(config.port, () => {
    console.log(`recognition-service escuchando en el puerto ${config.port}`);
  });
  subscribe();

  if (!jobs.purgeExpiredTranslations) console.warn('[recognition] TRANSLATION_RETENTION_DAYS=0: las traducciones no se borran');
  const retentionScheduler = jobs.purgeExpiredTranslations
    ? startRetentionScheduler({ run: jobs.purgeExpiredTranslations, tickMs: RETENTION_TICK_MS })
    : undefined;

  process.on('SIGTERM', () => {
    server.close();
    void (async () => {
      // Espera la vuelta de retencion en curso antes de cerrar la base.
      await retentionScheduler?.stop();
      await eventBus.close();
      await pool.end();
      await mongoClient?.close();
    })();
  });
};

start().catch(error => {
  console.error('[recognition] fallo al arrancar', error);
  process.exit(1);
});
