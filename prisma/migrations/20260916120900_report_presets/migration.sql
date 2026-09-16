-- CreateTable
CREATE TABLE "ReportPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportPreset_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ReportPreset" ADD CONSTRAINT "ReportPreset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
