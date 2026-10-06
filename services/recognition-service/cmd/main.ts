import 'dotenv/config';
import { MongoClient } from 'mongodb';
import {
  createEventBus, loadConfig, makeAuthMiddleware, makeJwtTokenProvider, makePgPool, requireRole,
} from '@traduce/shared';
import { makeRecognitionApp } from '../src/app';
import { loadRecognitionConfig } from '../src/config';
import { subscribeToLexiconEvents } from '../src/events/lexicon_events_subscriber';
import { InMemorySampleRepository } from '../src/samples/adapters/outbound/memory/in_memory_sample_repository';
import {
  ensureSampleIndexes, GESTURE_SAMPLES_COLLECTION, makeMongoSampleRepository, SampleDocument,
} from '../src/samples/adapters/outbound/mongo/mongo_sample_repository';
import { SampleRepository } from '../src/samples/ports/outbound/sample_repository';

const RECOGNITION_DEFAULT_PORT = 3002;
const ADMIN_ROLE = 'ADMIN';

const config = loadConfig({ prefix: 'RECOGNITION', defaultPort: RECOGNITION_DEFAULT_PORT });
const { mongoUrl } = loadRecognitionConfig();
const pool = makePgPool(config.db);
const eventBus = createEventBus(config.rabbitmqUrl);
const tokenProvider = makeJwtTokenProvider(config.jwt);
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
  const app = makeRecognitionApp({
    pool,
    eventPublisher: eventBus,
    sampleRepository: await makeSampleRepository(),
    authMiddleware: makeAuthMiddleware(tokenProvider),
    requireAdmin: requireRole(ADMIN_ROLE),
  });

  const server = app.listen(config.port, () => {
    console.log(`recognition-service escuchando en el puerto ${config.port}`);
  });
  // El broker puede tardar en estar arriba: subscribeWithRetry reintenta sin bloquear el arranque.
  void subscribeToLexiconEvents(eventBus);

  process.on('SIGTERM', () => {
    server.close();
    void eventBus.close();
    void pool.end();
    void mongoClient?.close();
  });
};

start().catch(error => {
  console.error('[recognition] fallo al arrancar', error);
  process.exit(1);
});
