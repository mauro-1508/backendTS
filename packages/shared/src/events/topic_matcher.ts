const WORD_SEPARATOR = '.';
const ONE_WORD = '*';
const ANY_WORDS = '#';

const matchWords = (pattern: string[], key: string[]): boolean => {
  if (pattern.length === 0) return key.length === 0;
  const [head, ...restPattern] = pattern;
  if (head === ANY_WORDS) {
    return restPattern.length === 0
      || key.some((_, i) => matchWords(restPattern, key.slice(i)))
      || matchWords(restPattern, []);
  }
  if (key.length === 0) return false;
  return (head === ONE_WORD || head === key[0]) && matchWords(restPattern, key.slice(1));
};

/** Semantica de los topic exchanges de AMQP para routing keys separadas por punto. */
export const matchesTopic = (pattern: string, routingKey: string): boolean =>
  matchWords(pattern.split(WORD_SEPARATOR), routingKey.split(WORD_SEPARATOR));
