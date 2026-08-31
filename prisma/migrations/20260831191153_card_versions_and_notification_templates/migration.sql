-- CreateTable
CREATE TABLE "BenefitCardVersion" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "block" "Block" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "condition" TEXT,
    "imageUrl" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL,
    "status" "CardStatus" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "partnerId" TEXT,
    "editedById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenefitCardVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "event" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("event")
);

-- CreateIndex
CREATE INDEX "BenefitCardVersion_cardId_idx" ON "BenefitCardVersion"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitCardVersion_cardId_version_key" ON "BenefitCardVersion"("cardId", "version");

-- AddForeignKey
ALTER TABLE "BenefitCardVersion" ADD CONSTRAINT "BenefitCardVersion_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BenefitCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitCardVersion" ADD CONSTRAINT "BenefitCardVersion_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
