import bcrypt from "bcryptjs";

/** ТЗ v2 §5.1: хеш пароля — bcrypt cost ≥ 12 (либо argon2id). */
export const BCRYPT_COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Нужно ли пере-хешировать (старый хеш со слабым cost) при следующем успешном входе. */
export function needsRehash(hash: string): boolean {
  const m = /^\$2[aby]\$(\d{2})\$/.exec(hash);
  return !m || Number.parseInt(m[1], 10) < BCRYPT_COST;
}
