"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/i18n";

export async function setLocale(locale: string): Promise<void> {
  if (!(LOCALES as readonly string[]).includes(locale)) return;
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale as Locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/");
}
