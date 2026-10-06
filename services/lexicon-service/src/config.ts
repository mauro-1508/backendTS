import path from 'path';
import { Env, makeEnvReader } from '@traduce/shared';

export interface LexiconConfig {
  /** Directorio de los modelos 3D y miniaturas que sirve /media. */
  mediaDir: string;
  /** Origen publico de los medios (CDN). Sin el, la API usa sus propias URL. */
  mediaBaseUrl?: string;
}

const ENV_PREFIX = 'LEXICON';

/** Unico lugar que lee LEXICON_MEDIA_DIR y LEXICON_MEDIA_BASE_URL. */
export const loadLexiconConfig = (env: Env = process.env, cwd: string = process.cwd()): LexiconConfig => {
  const read = makeEnvReader(env, ENV_PREFIX);
  return {
    mediaDir: read('MEDIA_DIR') ?? path.resolve(cwd, 'public', 'lexicon'),
    mediaBaseUrl: read('MEDIA_BASE_URL'),
  };
};
