import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SEC = 24 * 60 * 60;

export type TelegramWebAppUser = { id: number };

/**
 * Проверяет подпись Telegram WebApp initData — https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app.
 * HMAC считается токеном бота, подделать без него нельзя; auth_date отсекает старые данные.
 */
export function verifyTelegramWebAppInitData(initData: string, botToken: string): TelegramWebAppUser | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
  params.delete("hash");

  const dataCheckString = Array.from(params.keys())
    .sort()
    .map((key) => `${key}=${params.get(key)}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const given = Buffer.from(hash, "hex");
  if (computed.length !== given.length || !timingSafeEqual(computed, given)) return null;

  const authDate = Number(params.get("auth_date") ?? "0");
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SEC) return null;

  try {
    const user = JSON.parse(params.get("user") ?? "") as { id?: number };
    return user.id ? { id: user.id } : null;
  } catch {
    return null;
  }
}
