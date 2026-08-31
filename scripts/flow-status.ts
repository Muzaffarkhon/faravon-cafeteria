/**
 * Снимок состояния сквозного флоу «выбор → согласование → купон → выдача».
 * Запуск: npm run flow:status
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const period = await db.period.findFirst({
    where: { status: "OPEN" },
    orderBy: { startDate: "desc" },
  });
  const now = new Date();
  console.log("=== ПЕРИОД ===");
  if (period) {
    const open = period.windowStart <= now && now <= period.windowEnd;
    console.log(
      `${period.name}  статус=${period.status}  лимит=${period.maxSelections}  ` +
        `окно ${period.windowStart.toISOString().slice(0, 10)}..${period.windowEnd
          .toISOString()
          .slice(0, 10)}  открыто=${open ? "да" : "НЕТ"}`,
    );
  } else {
    console.log("Нет периода в статусе OPEN — сотрудник не сможет выбирать льготы.");
  }

  console.log("\n=== ПОЗИЦИИ ЗАЯВОК ===");
  const items = await db.applicationItem.findMany({
    include: {
      card: { select: { title: true } },
      application: { include: { employee: { select: { fullName: true } }, period: { select: { name: true } } } },
      coupon: { select: { number: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (items.length === 0) console.log("(пусто)");
  for (const i of items) {
    console.log(
      `  [${i.status.padEnd(14)}] ${i.application.employee.fullName} — ${i.card.title}` +
        (i.decisionComment ? `  причина: ${i.decisionComment}` : "") +
        (i.coupon ? `  купон ${i.coupon.number} (${i.coupon.status})` : ""),
    );
  }
  const byStatus = await db.applicationItem.groupBy({ by: ["status"], _count: true });
  console.log(
    "  итого:",
    byStatus.map((s) => `${s.status}=${s._count}`).join("  ") || "—",
  );

  const pending = await db.applicationItem.count({ where: { status: "PENDING" } });
  console.log(`\n=== СЧЁТЧИК «Согласование» === ${pending}`);

  console.log("\n=== КУПОНЫ ===");
  const coupons = await db.coupon.findMany({
    include: { employee: { select: { fullName: true } }, item: { select: { card: { select: { title: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  if (coupons.length === 0) console.log("(пусто)");
  for (const c of coupons) {
    console.log(
      `  ${c.number}  [${c.status}]  ${c.employee.fullName} — ${c.item.card.title}` +
        (c.validUntil ? `  до ${c.validUntil.toISOString().slice(0, 10)}` : ""),
    );
  }

  console.log("\n=== УВЕДОМЛЕНИЯ ===");
  const notif = await db.notification.groupBy({ by: ["event"], _count: true });
  if (notif.length === 0) console.log("(пусто)");
  for (const n of notif) {
    const undelivered = await db.notification.count({ where: { event: n.event, deliveredAt: null } });
    console.log(`  ${n.event}: всего ${n._count}, не доставлено ботом ${undelivered}`);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
