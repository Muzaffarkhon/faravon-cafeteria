import { timingSafeEqual } from "node:crypto";

/**
 * Сравнение секретов за постоянное время (защита от timing-атаки при подборе
 * заголовка). Длину не скрывает — для случайных секретов это некритично.
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
