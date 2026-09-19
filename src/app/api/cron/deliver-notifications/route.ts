import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { drainTelegramNotifications } from "@/lib/notification-drain";
import { runNewCardAnnouncements } from "@/lib/card-announcements";
import { runPeriodWindowNotifications } from "@/lib/period-notifications";
import { runPeriodLifecycle, type PeriodLifecycleResult } from "@/lib/period-lifecycle";
import { safeEqual } from "@/lib/timing-safe";

export const runtime = "nodejs";
// Рассылка идёт пачками с паузой (см. notification-delivery): ~25 сообщений в секунду,
// то есть 3000 сотрудников — около двух минут. 300 с — максимум для Hobby с Fluid Compute
// (включён по умолчанию у новых проектов Vercel); без Fluid потолок 60 с — тогда сборка
// на этом значении откажется, и его надо вернуть к 60 (а бюджет ниже — к 40 с).
export const maxDuration = 300;
// Новые проходы доставки запускаем не позже 240 с от старта: последний идёт ещё ~12 с,
// и всё укладывается в maxDuration с запасом. Бюджета хватает примерно на 5 000 сообщений.
const DELIVERY_BUDGET_MS = 240_000;
export const dynamic = "force-dynamic";

/**
 * Cron-доставка уведомлений в Telegram для webhook-развёртывания (Vercel),
 * где нет постоянного процесса бота. Расписание — в vercel.json.
 * Vercel Cron автоматически шлёт заголовок `Authorization: Bearer $CRON_SECRET`.
 * Заодно закрывает истёкшие периоды, открывает следующий по расписанию и
 * готовит черновик периода после него (runPeriodLifecycle) — ручное
 * управление в admin/periods остаётся доступным.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Автосмена периодов (§2) — до оконных уведомлений: если период только что
  // открылся автоматически, WINDOW_OPEN должен уйти в этом же запуске.
  let lifecycle: PeriodLifecycleResult = { closed: [], opened: [], drafted: null };
  try {
    lifecycle = await runPeriodLifecycle({
      log: (m) => console.log(`[cron/deliver:period] ${m}`),
    });
  } catch (e) {
    console.error("[cron/deliver] автосмена периодов:", e);
  }

  // Оконные уведомления (§5.10) — ставим в очередь, затем доставляем всё разом.
  let windows = { windowOpen: 0, windowClosing: 0 };
  try {
    windows = await runPeriodWindowNotifications();
  } catch (e) {
    console.error("[cron/deliver] оконные уведомления:", e);
  }

  // Оповещение о новых карточках витрины (утром, вместе с этим запуском) — тоже в очередь.
  let cards = { cards: 0, queued: 0 };
  try {
    cards = await runNewCardAnnouncements();
  } catch (e) {
    console.error("[cron/deliver] оповещение о новых карточках:", e);
  }

  // Несколько проходов подряд, пока очередь не опустеет или не выйдет время:
  // один проход — 300 сообщений, а рассылка идёт всем сотрудникам с Telegram.
  const result = await drainTelegramNotifications({
    db,
    token: process.env.TELEGRAM_BOT_TOKEN,
    budgetMs: DELIVERY_BUDGET_MS,
    log: (m) => console.log(`[cron/deliver] ${m}`),
  });

  return NextResponse.json({ ok: true, ...result, ...windows, newCards: cards, periods: lifecycle });
}
