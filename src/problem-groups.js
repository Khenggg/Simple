import { query } from './db.js';

export async function assertActiveGroupsExist(client, groupIds) {
  if (!groupIds || !groupIds.length) return;
  const { rows } = await client.query(
    'SELECT id FROM problem_groups WHERE id = ANY($1) AND is_active = TRUE',
    [groupIds]
  );
  if (rows.length !== groupIds.length) {
    throw new Error('Một hoặc nhiều nhóm bài tập không tồn tại hoặc đã bị ẩn.');
  }
}

export async function assertActiveProblemsExist(client, problemIds) {
  if (!problemIds || !problemIds.length) return;
  const { rows } = await client.query(
    'SELECT id FROM problems WHERE id = ANY($1) AND is_active = TRUE',
    [problemIds]
  );
  if (rows.length !== problemIds.length) {
    throw new Error('Một hoặc nhiều bài tập không tồn tại hoặc đã bị ẩn.');
  }
}

export async function assertGroupWillNotBeEmpty(client, groupId, nextProblemIds) {
  if (!nextProblemIds || nextProblemIds.length === 0) {
    throw new Error('Nhóm bài tập phải có ít nhất 1 bài. Không được tạo group trống.');
  }
}

export async function assertProblemsWillNotBeOrphaned(client, problemIdsToRemove, excludingGroupId) {
  if (!problemIdsToRemove || !problemIdsToRemove.length) return;
  
  // Find other active groups that contain these problems
  const { rows } = await client.query(
    `SELECT pgi.problem_id, COUNT(pg.id)::int as other_active_groups_count
     FROM problem_group_items pgi
     JOIN problem_groups pg ON pg.id = pgi.group_id AND pg.is_active = TRUE
     WHERE pgi.problem_id = ANY($1) AND pg.id != $2
     GROUP BY pgi.problem_id`,
    [problemIdsToRemove, excludingGroupId]
  );
  
  // Filter for active problems
  const activeProbsRes = await client.query(
    'SELECT id, title FROM problems WHERE id = ANY($1) AND is_active = TRUE',
    [problemIdsToRemove]
  );
  
  for (const p of activeProbsRes.rows) {
    const match = rows.find(r => r.problem_id === p.id);
    if (!match || match.other_active_groups_count === 0) {
      throw new Error(`Không thể gỡ bỏ bài "${p.title}" vì bài sẽ bị mồ côi (không thuộc nhóm hoạt động nào khác).`);
    }
  }
}

export async function assignProblemGroups(client, problemId, groupIds, adminId) {
  if (!groupIds || groupIds.length === 0) {
    throw new Error('Bài tập phải thuộc ít nhất 1 nhóm hoạt động.');
  }
  await client.query('DELETE FROM problem_group_items WHERE problem_id = $1', [problemId]);
  for (let i = 0; i < groupIds.length; i++) {
    await client.query(
      `INSERT INTO problem_group_items (group_id, problem_id, added_by, order_index)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (group_id, problem_id) DO NOTHING`,
      [groupIds[i], problemId, adminId, i]
    );
  }
}

export async function syncGroupProblems(client, groupId, problemIds, adminId) {
  await assertGroupWillNotBeEmpty(client, groupId, problemIds);
  
  const currentRes = await client.query(
    'SELECT problem_id FROM problem_group_items WHERE group_id = $1',
    [groupId]
  );
  const currentProblemIds = currentRes.rows.map(r => r.problem_id);
  const removed = currentProblemIds.filter(id => !problemIds.includes(id));
  
  await assertProblemsWillNotBeOrphaned(client, removed, groupId);

  await client.query('DELETE FROM problem_group_items WHERE group_id = $1', [groupId]);
  for (let i = 0; i < problemIds.length; i++) {
    await client.query(
      `INSERT INTO problem_group_items (group_id, problem_id, added_by, order_index)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (group_id, problem_id) DO NOTHING`,
      [groupId, problemIds[i], adminId, i]
    );
  }
}
