import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBackendVersion, UNKNOWN_VERSION } from '../src/version';

const withTempTree = (work: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), 'gateway-version-'));
  try {
    work(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe('readBackendVersion', () => {
  test('lee la version del package.json raiz del monorepo', () => {
    assert.equal(readBackendVersion(), '1.4.0');
  });

  test('salta los package.json de los workspaces hasta el que declara workspaces', () => {
    withTempTree(root => {
      const service = join(root, 'services', 'api-gateway', 'dist', 'src');
      mkdirSync(service, { recursive: true });
      writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '2.3.4', workspaces: ['services/*'] }));
      writeFileSync(join(root, 'services', 'api-gateway', 'package.json'), JSON.stringify({ version: '9.9.9' }));
      assert.equal(readBackendVersion(service), '2.3.4');
    });
  });

  test('sin version en la raiz: unknown', () => {
    withTempTree(root => {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['services/*'] }));
      assert.equal(readBackendVersion(root), UNKNOWN_VERSION);
    });
  });

  test('package.json raiz ilegible: unknown', () => {
    withTempTree(root => {
      writeFileSync(join(root, 'package.json'), '{ no es json');
      assert.equal(readBackendVersion(root), UNKNOWN_VERSION);
    });
  });
});
