import { cleanText, normalizeEmail, validEmail } from './validation.js';
import { validatePassword } from './auth.js';

export function normalizeUserInput(input) {
  return {
    email: normalizeEmail(input.email),
    fullName: cleanText(input.fullName, 100),
    role: String(input.role || 'STUDENT').trim().toUpperCase(),
    isActive: input.isActive !== undefined ? Boolean(input.isActive) : true
  };
}

export function validateUserCreate(input) {
  const errors = [];
  if (!input.email || !validEmail(input.email)) {
    errors.push('Email không hợp lệ.');
  }
  if (!input.fullName || !input.fullName.trim()) {
    errors.push('Họ tên không được để trống.');
  }
  if (!input.password) {
    errors.push('Mật khẩu không được để trống.');
  } else if (!validatePassword(input.password)) {
    errors.push('Mật khẩu phải chứa ít nhất 8 ký tự, bao gồm cả chữ và số.');
  }
  if (input.role !== 'ADMIN' && input.role !== 'STUDENT') {
    errors.push('Vai trò không hợp lệ.');
  }
  return errors;
}

export function validateUserUpdate(input) {
  const errors = [];
  if (!input.email || !validEmail(input.email)) {
    errors.push('Email không hợp lệ.');
  }
  if (!input.fullName || !input.fullName.trim()) {
    errors.push('Họ tên không được để trống.');
  }
  if (input.role !== 'ADMIN' && input.role !== 'STUDENT') {
    errors.push('Vai trò không hợp lệ.');
  }
  return errors;
}

export async function getActiveAdminCount(client) {
  const { rows } = await client.query(
    "SELECT COUNT(*)::int AS count FROM users WHERE role = 'ADMIN' AND is_active = TRUE"
  );
  return rows[0].count;
}

export async function assertCanModifyUserAdmin(client, actorUserId, targetUserId, nextRole, nextIsActive) {
  if (actorUserId === targetUserId) {
    if (nextIsActive === false || nextRole === 'STUDENT') {
      throw new Error('Không thể tự khóa hoặc hạ quyền tài khoản đang đăng nhập.');
    }
  }

  const { rows: targetRows } = await client.query(
    "SELECT role, is_active FROM users WHERE id = $1",
    [targetUserId]
  );
  const targetUser = targetRows[0];
  if (!targetUser) return; 

  const wasActiveAdmin = targetUser.role === 'ADMIN' && targetUser.is_active === true;
  const willStopBeingActiveAdmin = (nextRole === 'STUDENT' || nextIsActive === false);

  if (wasActiveAdmin && willStopBeingActiveAdmin) {
    const activeAdminCount = await getActiveAdminCount(client);
    if (activeAdminCount <= 1) {
      throw new Error('Không thể vô hiệu hóa hoặc hạ quyền admin cuối cùng.');
    }
  }
}

export async function getUserUsageCounts(client, userId) {
  const { rows: subCount } = await client.query("SELECT COUNT(*)::int FROM submissions WHERE user_id = $1", [userId]);
  const { rows: attCount } = await client.query("SELECT COUNT(*)::int FROM attempts WHERE user_id = $1", [userId]);
  const { rows: progCount } = await client.query("SELECT COUNT(*)::int FROM user_problem_progress WHERE user_id = $1", [userId]);
  const { rows: assignCount } = await client.query("SELECT COUNT(*)::int FROM student_problem_assignments WHERE user_id = $1", [userId]);
  
  return {
    submissions: subCount[0].count,
    attempts: attCount[0].count,
    progress: progCount[0].count,
    assignments: assignCount[0].count
  };
}

export function safeUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
