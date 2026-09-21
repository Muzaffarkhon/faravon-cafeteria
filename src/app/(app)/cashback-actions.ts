"use server";

import { getSession } from "@/lib/auth";
import { currentCashbackCode } from "@/lib/cashback-code";

/** Текущий код клиента для кассы — только для владельца (берётся из сессии, не из параметров). */
export async function getMyCashbackCode(): Promise<{ code: string; secondsLeft: number } | null> {
  const session = await getSession();
  if (!session?.employee) return null;
  return currentCashbackCode(session.employee.id);
}
