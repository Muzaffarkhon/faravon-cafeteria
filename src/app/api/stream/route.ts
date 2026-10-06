import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { onlineSessionWhere } from "@/lib/user-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STAFF_POLL_MS = 8000;
const EMPLOYEE_POLL_MS = 20_000;
const STAFF_RETRY_MS = 3000;
const EMPLOYEE_RETRY_MS = 15_000;
const MAX_LIFETIME_MS = 25_000;

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
  if (can(roles, "sessions.view")) {
    const [count, agg] = await Promise.all([
      db.userSession.count({ where: onlineSessionWhere() }),
      db.userSession.aggregate({ _max: { lastSeenAt: true }, where: onlineSessionWhere() }),
    ]);
    parts.push(`sess:${count}:${agg._max.lastSeenAt?.getTime() ?? 0}`);
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

  const isStaffOrContractor =
    can(session.roles, "applications.decide") ||
    can(session.roles, "coupons.manage") ||
    can(session.roles, "cards.manage") ||
    can(session.roles, "coupons.confirm") ||
    can(session.roles, "promo.broadcast") ||
    can(session.roles, "sessions.view") ||
    can(session.roles, "support.manage") ||
    Boolean(session.user.partnerId);

  if (!isStaffOrContractor) {
    return NextResponse.json(
      { error: "Постоянный SSE-поток доступен только персоналу C&B и подрядчикам. Для сотрудников обновление происходит при фокусе окна." },
      { status: 403 },
    );
  }

  const isStaff =
    can(session.roles, "applications.decide") ||
    can(session.roles, "coupons.manage") ||
    can(session.roles, "cards.manage");
  const pollMs = isStaff ? STAFF_POLL_MS : EMPLOYEE_POLL_MS;

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
        }
      };

      request.signal.addEventListener("abort", close);

      send(`retry: ${isStaff ? STAFF_RETRY_MS : EMPLOYEE_RETRY_MS}\n\n`);

      let last: string | null = null;
      try {
        last = await signatureFor(session);
      } catch {
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
      }, pollMs);
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
