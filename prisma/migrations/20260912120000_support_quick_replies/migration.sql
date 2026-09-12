-- CreateTable
CREATE TABLE "SupportQuickReply" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportQuickReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportQuickReply_seq_key" ON "SupportQuickReply"("seq");
