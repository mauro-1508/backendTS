import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { loadLexiconConfig } from '../src/config';

describe('loadLexiconConfig', () => {
  test('por defecto sirve public/lexicon del directorio de trabajo y sin CDN', () => {
    const config = loadLexiconConfig({}, '/srv/lexicon');
    assert.equal(config.mediaDir, path.resolve('/srv/lexicon', 'public', 'lexicon'));
    assert.equal(config.mediaBaseUrl, undefined);
  });

  test('lee LEXICON_MEDIA_DIR y LEXICON_MEDIA_BASE_URL una sola vez', () => {
    const config = loadLexiconConfig({
      LEXICON_MEDIA_DIR: '/data/media',
      LEXICON_MEDIA_BASE_URL: 'https://cdn.example.com/lex',
    });
    assert.equal(config.mediaDir, '/data/media');
    assert.equal(config.mediaBaseUrl, 'https://cdn.example.com/lex');
  });

  test('variables vacias se tratan como ausentes', () => {
    const config = loadLexiconConfig({ LEXICON_MEDIA_DIR: '', LEXICON_MEDIA_BASE_URL: '' }, '/srv');
    assert.equal(config.mediaDir, path.resolve('/srv', 'public', 'lexicon'));
    assert.equal(config.mediaBaseUrl, undefined);
  });
});
