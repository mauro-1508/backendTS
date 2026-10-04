import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, makeEnvReader } from '../src/config/load_config';

describe('loadConfig', () => {
  test('usa los valores por defecto cuando no hay variables', () => {
    const config = loadConfig({ defaultPort: 3003, env: {} });
    assert.equal(config.port, 3003);
    assert.equal(config.db.port, 5432);
    assert.equal(config.jwt.expiresIn, '1d');
    assert.equal(config.rabbitmqUrl, '');
  });

  test('lee las variables sin prefijo', () => {
    const config = loadConfig({
      defaultPort: 3003,
      env: { PORT: '4000', DB_HOST: 'db', DB_PORT: '5433', DB_NAME: 'x', JWT_SECRET: 's', RABBITMQ_URL: 'amqp://r' },
    });
    assert.equal(config.port, 4000);
    assert.equal(config.db.host, 'db');
    assert.equal(config.db.port, 5433);
    assert.equal(config.db.database, 'x');
    assert.equal(config.jwt.secret, 's');
    assert.equal(config.rabbitmqUrl, 'amqp://r');
  });

  test('la variable con prefijo gana sobre la general', () => {
    const config = loadConfig({
      prefix: 'LEXICON',
      defaultPort: 3003,
      env: { DB_HOST: 'general', LEXICON_DB_HOST: 'propio', PORT: '1' },
    });
    assert.equal(config.db.host, 'propio');
    assert.equal(config.port, 1);
  });
});

describe('makeEnvReader', () => {
  test('una variable vacia con prefijo cae a la general', () => {
    const read = makeEnvReader({ LEXICON_X: '', X: 'general' }, 'LEXICON');
    assert.equal(read('X'), 'general');
  });

  test('una variable ausente devuelve undefined', () => {
    assert.equal(makeEnvReader({}, 'LEXICON')('X'), undefined);
  });
});
