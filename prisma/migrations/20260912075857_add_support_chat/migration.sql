-- CreateEnum
CREATE TYPE "SupportThreadStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportMessageDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "SupportThread" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "telegramId" TEXT NOT NULL,
    "phone" TEXT,
    "status" "SupportThreadStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "direction" "SupportMessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportThread_seq_key" ON "SupportThread"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "SupportThread_telegramId_key" ON "SupportThread"("telegramId");

-- CreateIndex
CREATE INDEX "SupportThread_status_lastMessageAt_idx" ON "SupportThread"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "SupportMessage_threadId_createdAt_idx" ON "SupportMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "SupportThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

