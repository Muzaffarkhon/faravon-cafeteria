export type ParsedUserAgent = { device: "mobile" | "desktop" | "unknown"; browser: string | null };

/**
 * Грубый разбор User-Agent — без внешней зависимости (ua-parser и т.п. не
 * нужны, хватает "телефон/ноутбук + название браузера" для § "Кто онлайн").
 */
export function parseUserAgent(ua: string | null): ParsedUserAgent {
  if (!ua) return { device: "unknown", browser: null };
  const device: ParsedUserAgent["device"] = /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Chrome\//.test(ua) && !/Chromium/.test(ua) ? "Chrome" :
    /Safari\//.test(ua) && !/Chrome/.test(ua) ? "Safari" :
    null;
  return { device, browser };
}
