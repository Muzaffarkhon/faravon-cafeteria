-- CreateTable
CREATE TABLE "GamificationSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GamificationSettings_pkey" PRIMARY KEY ("id")
);
