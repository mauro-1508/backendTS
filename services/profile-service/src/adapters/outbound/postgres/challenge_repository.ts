import { ChallengeAssignment, ChallengeDefinition } from '../../../domain/challenge';
import { ChallengeRepository } from '../../../ports/repositories';
import { Queryable } from './postgres_repositories';

const definitionOf = (row: Record<string, any>): ChallengeDefinition => ({
  challengeId: row.challenge_id, code: row.code, name: row.name, description: row.description,
  targetCount: row.target_count, points: row.points, localizations: row.localizations,
});
const assignmentOf = (row: Record<string, any>): ChallengeAssignment => ({
  ...definitionOf(row), assignmentId: row.user_challenge_id, date: row.date,
  currentCount: row.current_count, completed: row.completed_at !== null,
  completedAt: row.completed_at?.toISOString() ?? null,
});
export const makePostgresChallengeRepository = (db: Queryable): ChallengeRepository => ({
  async rewardTotal(userId) {
    const { rows } = await db.query('SELECT COALESCE(sum(points),0) AS total FROM challenge_rewards WHERE user_id=$1', [userId]);
    return Number(rows[0].total);
  },
  async findReward(userId, assignmentId) {
    const { rows } = await db.query('SELECT points,granted_at FROM challenge_rewards WHERE user_id=$1 AND user_challenge_id=$2', [userId,assignmentId]);
    return rows[0] ? { points: rows[0].points, grantedAt: rows[0].granted_at.toISOString() } : null;
  },
  async listActive() {
    const { rows } = await db.query('SELECT * FROM challenges WHERE is_active ORDER BY code COLLATE "C"');
    return rows.map(definitionOf);
  },
  async findAssignment(userId, date) {
    const { rows } = await db.query("SELECT *, challenge_date::text AS date FROM user_challenges WHERE user_id=$1 AND challenge_date=$2::date", [userId, date]);
    return rows[0] ? assignmentOf(rows[0]) : null;
  },
  async save(userId, challenge) {
    // El conflicto solo actualiza avance: nunca cambia identidad, meta ni recompensa.
    const { rows } = await db.query(`INSERT INTO user_challenges
      (user_id,challenge_date,challenge_id,code,name,description,target_count,points,localizations,current_count,completed_at)
      VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
      ON CONFLICT(user_id,challenge_date) DO UPDATE SET
        current_count=CASE WHEN user_challenges.completed_at IS NULL THEN EXCLUDED.current_count ELSE user_challenges.current_count END,
        completed_at=COALESCE(user_challenges.completed_at,EXCLUDED.completed_at)
      RETURNING *, challenge_date::text AS date`, [userId,challenge.date,challenge.challengeId,challenge.code,
      challenge.name,challenge.description,challenge.targetCount,challenge.points,JSON.stringify(challenge.localizations),
      challenge.currentCount,challenge.completedAt]);
    return assignmentOf(rows[0]);
  },
  async grantReward(userId, assignment) {
    const result = await db.query(`INSERT INTO challenge_rewards(user_challenge_id,user_id,points)
      SELECT user_challenge_id,user_id,points FROM user_challenges
      WHERE user_challenge_id=$1 AND user_id=$2 AND completed_at IS NOT NULL
      ON CONFLICT(user_challenge_id) DO NOTHING`, [assignment.assignmentId,userId]);
    return result.rowCount === 1;
  },
});
