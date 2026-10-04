// Ejecuta todos los *.test.ts del backend (raiz y workspaces) con node:test.
// Node 20 no expande globs en `node --test`, asi que se listan los archivos aqui.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TEST_ROOTS = ['tests', 'packages', 'services'];
const IGNORED_DIRS = new Set(['node_modules', 'dist']);
const TEST_FILE = /\.test\.ts$/;

const listTestFiles = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (IGNORED_DIRS.has(entry.name)) return [];
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return listTestFiles(full);
        return TEST_FILE.test(entry.name) ? [full] : [];
      })
    : [];

const files = TEST_ROOTS.flatMap((name) => listTestFiles(path.join(ROOT, name))).sort();

if (files.length === 0) {
  console.error('No se encontraron archivos *.test.ts');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--require', 'ts-node/register', '--test', ...files],
  { stdio: 'inherit', cwd: ROOT },
);
process.exit(result.status ?? 1);
