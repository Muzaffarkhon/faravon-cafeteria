-- CreateTable
CREATE TABLE "SatisfactionSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "repeatDays" INTEGER NOT NULL DEFAULT 90,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SatisfactionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatisfactionResponse" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "employeeId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SatisfactionResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionResponse_seq_key" ON "SatisfactionResponse"("seq");

-- CreateIndex
CREATE INDEX "SatisfactionResponse_employeeId_idx" ON "SatisfactionResponse"("employeeId");

-- CreateIndex
CREATE INDEX "SatisfactionResponse_createdAt_idx" ON "SatisfactionResponse"("createdAt");

-- AddForeignKey
ALTER TABLE "SatisfactionResponse" ADD CONSTRAINT "SatisfactionResponse_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
