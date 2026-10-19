import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const UNKNOWN_VERSION = 'unknown';

/**
 * Version del backend: la del package.json raiz del monorepo (el que declara `workspaces`).
 * Se busca subiendo desde este archivo, asi sirve igual con ts-node (src/) que compilado (dist/src/)
 * y dentro de la imagen Docker, que copia el package.json raiz a /app.
 */
export const readBackendVersion = (startDir: string = __dirname): string => {
  let dir = startDir;
  for (;;) {
    const file = join(dir, 'package.json');
    if (existsSync(file)) {
      try {
        const pkg = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown; workspaces?: unknown };
        if (pkg.workspaces) return typeof pkg.version === 'string' && pkg.version ? pkg.version : UNKNOWN_VERSION;
      } catch {
        return UNKNOWN_VERSION;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return UNKNOWN_VERSION;
    dir = parent;
  }
};
