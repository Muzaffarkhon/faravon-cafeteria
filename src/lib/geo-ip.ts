import "server-only";

export type GeoInfo = { city: string | null; country: string | null };

/**
 * Best-effort геолокация по IP — https://ipapi.co, без ключа и без новой
 * npm-зависимости. Вызывается ОДИН раз при создании новой UserSession (не на
 * каждый тач lastSeenAt). Любая ошибка/таймаут — просто { null, null },
 * логин не должен падать из-за стороннего сервиса.
 */
export async function lookupGeoIp(ip: string | null): Promise<GeoInfo> {
  if (!ip || ip === "unknown") return { city: null, country: null };
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return { city: null, country: null };
    const data = (await res.json()) as { city?: string; country_name?: string; error?: boolean };
    if (data.error) return { city: null, country: null };
    return { city: data.city ?? null, country: data.country_name ?? null };
  } catch {
    return { city: null, country: null };
  }
}
