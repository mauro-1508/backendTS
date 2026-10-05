import { describe, expect, it } from 'vitest';
import { makeFakeIamRepository } from './fake_iam_repository';
import { makeIsLastAdmin } from '../../../src/domains/iam/application/is_last_admin';
import { InvalidIamInputError } from '../../../src/domains/iam/domain/service';

describe('is_last_admin', () => {
  it('true solo si es el unico ADMIN', async () => {
    const fake = makeFakeIamRepository();
    const isLastAdmin = makeIsLastAdmin({ iamRepository: fake.repo });
    expect(await isLastAdmin(10)).toBe(false); // no es admin
    fake.userRoles.add('10:3');
    expect(await isLastAdmin(10)).toBe(true);
    fake.userRoles.add('11:3');
    expect(await isLastAdmin(10)).toBe(false);
  });
  it('rechaza ids invalidos', async () => {
    const fake = makeFakeIamRepository();
    await expect(makeIsLastAdmin({ iamRepository: fake.repo })(0)).rejects.toThrow(InvalidIamInputError);
  });
});
