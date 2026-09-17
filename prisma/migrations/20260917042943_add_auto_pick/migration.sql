-- CreateTable
CREATE TABLE "AutoPick" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoPick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoPick_employeeId_idx" ON "AutoPick"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoPick_cardId_employeeId_key" ON "AutoPick"("cardId", "employeeId");

-- AddForeignKey
ALTER TABLE "AutoPick" ADD CONSTRAINT "AutoPick_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BenefitCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoPick" ADD CONSTRAINT "AutoPick_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
