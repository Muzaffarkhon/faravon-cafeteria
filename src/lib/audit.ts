import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function audit(params: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
}) {
  await db.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      oldValue: params.oldValue,
      newValue: params.newValue,
    },
  });
}
