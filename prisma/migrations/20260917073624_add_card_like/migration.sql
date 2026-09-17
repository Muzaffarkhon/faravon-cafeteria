-- CreateTable
CREATE TABLE "CardLike" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardLike_cardId_idx" ON "CardLike"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "CardLike_cardId_employeeId_key" ON "CardLike"("cardId", "employeeId");

-- AddForeignKey
ALTER TABLE "CardLike" ADD CONSTRAINT "CardLike_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BenefitCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardLike" ADD CONSTRAINT "CardLike_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

