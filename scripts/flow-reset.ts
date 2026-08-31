/**
 * Откат сквозного флоу к «чистому листу»: удаляет все заявки, позиции,
 * купоны и связанные уведомления/аудит. Периоды, льготы, партнёры и
 * пользователи не трогаются.
 * Запуск: npm run flow:reset
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const c1 = await db.coupon.deleteMany({});
  const c2 = await db.applicationItem.deleteMany({});
  const c3 = await db.application.deleteMany({});
  const c4 = await db.notification.deleteMany({
    where: {
      event: {
        in: ["APPLICATION_SUBMITTED", "ITEM_APPROVED", "ITEM_REJECTED", "COUPON_CREATED", "COUPON_ISSUED"],
      },
    },
  });
  const c5 = await db.auditLog.deleteMany({
    where: {
      action: {
        in: [
          "SELECTION_ADDED",
          "SELECTION_REMOVED",
          "APPLICATION_SUBMITTED",
          "ITEM_CANCELLED",
          "ITEM_APPROVED",
          "ITEM_REJECTED",
          "COUPON_CREATED",
          "COUPON_ISSUED",
        ],
      },
    },
  });

  console.log(
    `Удалено: купонов ${c1.count}, позиций ${c2.count}, заявок ${c3.count}, ` +
      `уведомлений ${c4.count}, записей аудита ${c5.count}. Флоу сброшен.`,
  );
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
