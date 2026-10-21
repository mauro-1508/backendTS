import { randomUUID } from 'crypto';
import { EventPublisher } from '@traduce/shared';
import { UnitOfWork } from '../ports/repositories';
import { ALPHABET_CODES } from '../domain/translation_vocabulary';
import { updateActivityProgress } from './activity_progress';
import { PUBLISHED_EVENTS } from '../domain/events';
import { publishQuietly } from './publish_event';

export const makeRecordActivity = (deps: { unitOfWork: UnitOfWork; eventPublisher: EventPublisher; now?: () => number }) =>
  async (userId: string, input: unknown) => {
    const body = input as Record<string, unknown>;
    if (!body || typeof body !== 'object' || typeof body.sessionId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.sessionId)) throw new Error('Invalid activity');
    const sessionId = body.sessionId;
    const now = (deps.now ?? Date.now)();
    const result = await deps.unitOfWork.run(async repos => {
      await repos.gamificationLocks.lockUser(userId);
      if (await repos.profiles.isErased(userId) || !repos.activity) return { unlocked: [], playbackId: undefined };
      const state = await repos.activity.load(userId);
      let playbackId: string | undefined;
      switch (body.kind) {
        case 'letter':
          if (typeof body.code !== 'string' || !ALPHABET_CODES.has(body.code)) throw new Error('Invalid letter');
          if (!state.letters.includes(body.code)) state.letters.push(body.code);
          break;
        case 'tick': {
          if (state.session !== sessionId) break;
          // Accept only a continuous, server-timed window following a confirmed translation.
          const elapsed = state.lastTick === undefined ? 0 : now - state.lastTick;
          if (state.session === sessionId && state.confirmedAt !== undefined && now - state.confirmedAt <= 15000 &&
              elapsed > 0 && elapsed <= 10000) state.activeSeconds += Math.floor(elapsed / 1000);
          state.lastTick = state.session === sessionId ? now : undefined;
          break;
        }
        case 'pause': if (state.session === sessionId) state.lastTick = undefined; break;
        case 'voice-start': {
          if (!Number.isSafeInteger(body.translationId) || !state.translations.includes(body.translationId as number)) throw new Error('Unknown translation');
          // Separate sessions cannot replace or cancel each other's playback.
          state.playbacks = Object.fromEntries(Object.entries(state.playbacks ?? {}).filter(([,p]) => now - p.startedAt <= 600000));
          if (Object.keys(state.playbacks).length >= 10 && !state.playbacks[sessionId]) throw new Error('Invalid playback limit');
          playbackId = randomUUID();
          state.playbacks[sessionId] = { id: playbackId, startedAt: now, translationId: body.translationId as number };
          break;
        }
        case 'voice-end':
        case 'voice-cancel': {
          const playback = state.playbacks?.[sessionId];
          if (playback && playback.id === body.playbackId) {
            if (body.kind === 'voice-end' && now - playback.startedAt >= 0 && now - playback.startedAt <= 600000) state.voice = Math.min(25, state.voice + 1);
            delete state.playbacks![sessionId];
          }
          break;
        }
        default: throw new Error('Invalid activity kind');
      }
      await repos.activity.save(userId, state);
      return { unlocked: await updateActivityProgress(repos, userId, state), playbackId };
    });
    for (const { achievement } of result.unlocked) await publishQuietly(deps.eventPublisher, PUBLISHED_EVENTS.AchievementUnlocked,
      { userId, achievementId: achievement.id, code: achievement.code, points: achievement.points });
    return { playbackId: result.playbackId };
  };
