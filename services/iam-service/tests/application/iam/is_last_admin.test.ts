import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeIamRepository } from './fake_iam_repository';
import { makeIsLastAdmin } from '../../../src/iam/application/is_last_admin';
import { InvalidIamInputError } from '../../../src/iam/domain/service';

describe('is_last_admin', () => {
  test('true solo si es el unico ADMIN', async () => {
    const fake = makeFakeIamRepository();
    const isLastAdmin = makeIsLastAdmin({ iamRepository: fake.repo });
    assert.equal(await isLastAdmin(10), false); // no es admin
    fake.userRoles.add('10:3');
    assert.equal(await isLastAdmin(10), true);
    fake.userRoles.add('11:3');
    assert.equal(await isLastAdmin(10), false);
  });

  test('rechaza ids invalidos', async () => {
    const fake = makeFakeIamRepository();
    await assert.rejects(makeIsLastAdmin({ iamRepository: fake.repo })(0), InvalidIamInputError);
  });
});
