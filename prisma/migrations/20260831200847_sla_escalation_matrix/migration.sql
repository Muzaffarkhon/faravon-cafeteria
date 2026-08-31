-- AlterTable
ALTER TABLE "ApplicationItem" ADD COLUMN     "escalationLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastEscalatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SlaEscalationRule" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "afterHours" INTEGER NOT NULL,
    "notifyRoles" "Role"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaEscalationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlaEscalationRule_level_key" ON "SlaEscalationRule"("level");
