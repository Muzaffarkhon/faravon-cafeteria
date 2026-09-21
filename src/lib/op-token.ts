import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Токен операции кассы: подписанное (HMAC-SHA256) короткоживущее свидетельство
 * «этот кассир нашёл этого сотрудника у этого партнёра». Проведение кешбека принимает
 * только такой токен — id сотрудника и партнёра от браузера не принимаются, поэтому
 * провести операцию по произвольному сотруднику или партнёру нельзя. `nonce` служит
 * ключом идемпотентности операции.
 */

const TTL_MS = 5 * 60 * 1000;

export type OpClaims = {
  employeeId: string;
  partnerId: string;
  actorId: string;
  nonce: string;
  /** Срок действия, мс с эпохи. */
  exp: number;
};

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET не задан");
  return createHmac("sha256", secret).update("cashback-op-token-v1").digest();
}

const b64 = (b: Buffer) => b.toString("base64url");

export function signOpToken(
  claims: Pick<OpClaims, "employeeId" | "partnerId" | "actorId">,
  now: number = Date.now(),
): string {
  const payload: OpClaims = { ...claims, nonce: randomBytes(16).toString("hex"), exp: now + TTL_MS };
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const sig = b64(createHmac("sha256", key()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyOpToken(token: string, now: number = Date.now()): OpClaims | null {
  if (typeof token !== "string" || token.length > 1024) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = createHmac("sha256", key()).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<OpClaims>;
    if (
      typeof c.employeeId !== "string" ||
      typeof c.partnerId !== "string" ||
      typeof c.actorId !== "string" ||
      typeof c.nonce !== "string" ||
      typeof c.exp !== "number" ||
      c.exp < now
    ) {
      return null;
    }
    return c as OpClaims;
  } catch {
    return null;
  }
}
