"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/i18n";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function setLocale(locale: string): Promise<void> {
  if (!(LOCALES as readonly string[]).includes(locale)) return;
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale as Locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  // Запоминаем язык за учёткой — рассылки и уведомления пишут человеку на его языке.
  try {
    const s = await getSession();
    if (s && s.user.locale !== locale) await db.user.update({ where: { id: s.user.id }, data: { locale } });
  } catch {
    // язык в cookie уже сохранён — сбой записи в БД не должен ломать переключение
  }
  revalidatePath("/");
}
