import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Верхняя граница жизни функции. Соединение всё равно закрывается раньше
// (MAX_LIFETIME_MS), а браузер (EventSource) переподключается сам.
export const maxDuration = 30;

// Живое обновление разделов без внешней инфраструктуры (нет WebSocket-сервера,
// нет Redis). На Vercel Hobby держать SSE открытым долго нельзя — лимит времени
// функции, — поэтому соединение короткоживущее: сервер стримит ~25 с и
// закрывается, EventSource переподключается через `retry`. Пока соединение
// живо, сервер каждые POLL_MS сверяет «сигнатуру» релевантных пользователю
// данных и присылает событие `update` только при её изменении.
const POLL_MS = 8000;
const MAX_LIFETIME_MS = 25_000;

// Мягкий лимит одновременных SSE-соединений на пользователя (в пределах одного
// инстанса функции). Защита от «открыл 50 вкладок» → 50×N агрегатов каждые
// POLL_MS. EventSource переподключается, поэтому кратковременный отказ безвреден.
const MAX_CONN_PER_USER = 6;
const liveConns = new Map<string, number>();

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** Компактный слепок того, что влияет на счётчики/списки этого пользователя. */
async function signatureFor(session: Session): Promise<string> {
  const roles = session.roles;
  const parts: string[] = [];

  if (can(roles, "applications.decide")) {
    const [pending, agg] = await Promise.all([
      db.applicationItem.count({ where: { status: "PENDING" } }),
      db.applicationItem.aggregate({ _max: { updatedAt: true } }),
    ]);
    parts.push(`rev:${pending}:${agg._max.updatedAt?.getTime() ?? 0}`);
  }
  if (can(roles, "coupons.manage")) {
    const [pending, agg] = await Promise.all([
      db.applicationItem.count({ where: { status: "APPROVED", coupon: null } }),
      db.coupon.aggregate({ _max: { updatedAt: true } }),
    ]);
    parts.push(`cpn:${pending}:${agg._max.updatedAt?.getTime() ?? 0}`);
  }
  if (can(roles, "cards.manage")) {
    const [pending, agg] = await Promise.all([
      db.advertisingRequest.count({ where: { status: "PENDING" } }),
      db.advertisingRequest.aggregate({ _max: { updatedAt: true } }),
    ]);
    parts.push(`ad:${pending}:${agg._max.updatedAt?.getTime() ?? 0}`);
  }
  if (session.employee) {
    const employeeId = session.employee.id;
    const [unread, items, coupons] = await Promise.all([
      db.notification.count({ where: { userId: session.user.id, readAt: null } }),
      db.applicationItem.aggregate({
        _max: { updatedAt: true },
        where: { application: { employeeId } },
      }),
      db.coupon.aggregate({ _max: { updatedAt: true }, where: { employeeId } }),
    ]);
    parts.push(
      `me:${unread}:${items._max.updatedAt?.getTime() ?? 0}:${coupons._max.updatedAt?.getTime() ?? 0}`,
    );
  }
  return parts.join("|");
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  }

  const uid = session.user.id;
  const n = liveConns.get(uid) ?? 0;
  if (n >= MAX_CONN_PER_USER) {
    return NextResponse.json({ error: "Слишком много открытых соединений." }, { status: 429 });
  }
  liveConns.set(uid, n + 1);
  const releaseConn = () => {
    const cur = (liveConns.get(uid) ?? 1) - 1;
    if (cur <= 0) liveConns.delete(uid);
    else liveConns.set(uid, cur);
  };

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            closed = true;
          }
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        releaseConn();
        try {
          controller.close();
        } catch {
          /* уже закрыт */
        }
      };

      request.signal.addEventListener("abort", close);

      // Подсказка браузеру: переподключаться через 3 с после разрыва.
      send("retry: 3000\n\n");

      // null — базовая сигнатура ещё не получена (например, Neon просыпается).
      // Пока её нет, первый удачный опрос принимаем за базу и НЕ шлём `update`,
      // иначе холодный старт всегда выглядел бы как изменение.
      let last: string | null = null;
      try {
        last = await signatureFor(session);
      } catch {
        /* сверимся на следующем тике */
      }
      send(`event: hello\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);

      const startedAt = Date.now();
      timer = setInterval(async () => {
        if (closed) return;
        if (Date.now() - startedAt > MAX_LIFETIME_MS) {
          send("event: bye\ndata: {}\n\n");
          close();
          return;
        }
        try {
          const now = await signatureFor(session);
          if (last === null) {
            last = now; // первая удачная сигнатура — это база, не изменение
            send(": base\n\n");
          } else if (now !== last) {
            last = now;
            send(`event: update\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);
          } else {
            send(": ping\n\n"); // heartbeat — не даём прокси закрыть соединение
          }
        } catch {
          send(": err\n\n");
        }
      }, POLL_MS);
    },
    cancel() {
      if (!closed) releaseConn();
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
