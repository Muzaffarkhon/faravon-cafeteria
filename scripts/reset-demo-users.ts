import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const h = await bcrypt.hash("Password1", 12);
  await db.user.updateMany({
    where: { login: { in: ["ivanov", "petrova", "sidorov"] } },
    data: { passwordHash: h, mustChangePassword: false, otpExpiresAt: null, failedLoginCount: 0, lockedUntil: null },
  });
  await db.employee.updateMany({
    where: { tabNumber: { in: ["0001", "0002", "0003"] } },
    data: { telegramId: null },
  });
  await db.identificationCode.deleteMany({});
  await db.auditLog.deleteMany({
    where: {
      action: {
        in: [
          "OTP_ISSUED",
          "TELEGRAM_LINKED",
          "TELEGRAM_UNLINKED",
          "ID_CODE_ISSUED",
          "PASSWORD_CHANGED",
          "PASSWORD_CHANGE_FAILED",
        ],
      },
    },
  });
  console.log("demo users reset to Password1");
}

main().then(() => process.exit(0));
