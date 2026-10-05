import { describe, expect, it } from 'vitest';
import { dtwDistance, gestureConfidence, MAX_GESTURE_DISTANCE, SEQ_LEN, FRAME_DIM, resampleSequence } from '../../../src/domains/ia/domain/motion_template';

describe('motion_template', () => {
  it('dtwDistance de secuencias iguales es 0', () => {
    const s = [[0, 1], [1, 2], [2, 3]];
    expect(dtwDistance(s, s)).toBe(0);
  });

  it('gestureConfidence da 0.7 en el umbral y se acota a 0.5..0.95', () => {
    expect(gestureConfidence(MAX_GESTURE_DISTANCE)).toBeCloseTo(0.7);
    expect(gestureConfidence(0)).toBe(0.95);
    expect(gestureConfidence(100)).toBe(0.5);
  });

  it('resampleSequence devuelve SEQ_LEN frames o null', () => {
    const frames = Array.from({ length: 5 }, () => new Float32Array(FRAME_DIM));
    expect(resampleSequence(frames)).toHaveLength(SEQ_LEN);
    expect(resampleSequence([frames[0]])).toBeNull();
  });
});
