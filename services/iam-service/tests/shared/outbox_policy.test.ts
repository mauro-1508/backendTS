import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outboxRelayMode } from '../../src/shared/application/outbox_policy';

test('con broker el relay corre', () => {
  assert.equal(outboxRelayMode({ rabbitmqUrl: 'amqp://x', nodeEnv: 'production' }), 'run');
});

test('sin broker en produccion el arranque falla', () => {
  assert.throws(() => outboxRelayMode({ rabbitmqUrl: '', nodeEnv: 'production' }), /obligatorio en produccion/);
});

test('sin broker en desarrollo el relay no corre (no marca publicados con el bus en memoria)', () => {
  assert.equal(outboxRelayMode({ rabbitmqUrl: '', nodeEnv: 'development' }), 'skip');
  assert.equal(outboxRelayMode({ rabbitmqUrl: '' }), 'skip');
});
