import "server-only";
import { headers } from "next/headers";

/**
 * IP и User-Agent клиента для журналов входа и лимитов.
 * На Vercel `x-vercel-forwarded-for` проставляет платформа и его нельзя подделать из запроса.
 * У обычного `x-forwarded-for` доверять можно только ПРАВОМУ элементу (ближайший к платформе хоп) —
 * левый задаёт клиент, из-за чего лимит перебора по IP раньше обходился сменой заголовка на каждый запрос.
 */
export async function clientMeta() {
  const h = await headers();
  const vercel = h.get("x-vercel-forwarded-for")?.trim();
  const fwd = h.get("x-forwarded-for");
  const rightmost = fwd ? fwd.split(",").map((s) => s.trim()).filter(Boolean).pop() : undefined;
  const ip = vercel || rightmost || h.get("x-real-ip")?.trim() || "unknown";
  const userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
  return { ip, userAgent };
}
