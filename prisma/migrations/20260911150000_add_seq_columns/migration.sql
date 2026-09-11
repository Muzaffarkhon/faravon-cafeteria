-- Сквозной порядковый номер (RowId): назначается один раз по порядку создания
-- (createdAt, id — для детерминизма при равных createdAt) и больше никогда не
-- пересчитывается. Удалённая запись просто пропадает из последовательности,
-- остальные номера не сдвигаются (обычный Postgres SERIAL/autoincrement).

-- Employee
ALTER TABLE "Employee" ADD COLUMN "seq" INTEGER;
CREATE SEQUENCE "Employee_seq_seq";
UPDATE "Employee" e SET "seq" = t.rn
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn FROM "Employee") t
WHERE e."id" = t."id";
ALTER TABLE "Employee" ALTER COLUMN "seq" SET NOT NULL;
ALTER TABLE "Employee" ALTER COLUMN "seq" SET DEFAULT nextval('"Employee_seq_seq"');
SELECT setval('"Employee_seq_seq"', COALESCE((SELECT MAX("seq") FROM "Employee"), 0));
ALTER SEQUENCE "Employee_seq_seq" OWNED BY "Employee"."seq";
CREATE UNIQUE INDEX "Employee_seq_key" ON "Employee"("seq");

-- User
ALTER TABLE "User" ADD COLUMN "seq" INTEGER;
CREATE SEQUENCE "User_seq_seq";
UPDATE "User" e SET "seq" = t.rn
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn FROM "User") t
WHERE e."id" = t."id";
ALTER TABLE "User" ALTER COLUMN "seq" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "seq" SET DEFAULT nextval('"User_seq_seq"');
SELECT setval('"User_seq_seq"', COALESCE((SELECT MAX("seq") FROM "User"), 0));
ALTER SEQUENCE "User_seq_seq" OWNED BY "User"."seq";
CREATE UNIQUE INDEX "User_seq_key" ON "User"("seq");

-- Partner
ALTER TABLE "Partner" ADD COLUMN "seq" INTEGER;
CREATE SEQUENCE "Partner_seq_seq";
UPDATE "Partner" e SET "seq" = t.rn
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn FROM "Partner") t
WHERE e."id" = t."id";
ALTER TABLE "Partner" ALTER COLUMN "seq" SET NOT NULL;
ALTER TABLE "Partner" ALTER COLUMN "seq" SET DEFAULT nextval('"Partner_seq_seq"');
SELECT setval('"Partner_seq_seq"', COALESCE((SELECT MAX("seq") FROM "Partner"), 0));
ALTER SEQUENCE "Partner_seq_seq" OWNED BY "Partner"."seq";
CREATE UNIQUE INDEX "Partner_seq_key" ON "Partner"("seq");

-- ApplicationItem
ALTER TABLE "ApplicationItem" ADD COLUMN "seq" INTEGER;
CREATE SEQUENCE "ApplicationItem_seq_seq";
UPDATE "ApplicationItem" e SET "seq" = t.rn
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn FROM "ApplicationItem") t
WHERE e."id" = t."id";
ALTER TABLE "ApplicationItem" ALTER COLUMN "seq" SET NOT NULL;
ALTER TABLE "ApplicationItem" ALTER COLUMN "seq" SET DEFAULT nextval('"ApplicationItem_seq_seq"');
SELECT setval('"ApplicationItem_seq_seq"', COALESCE((SELECT MAX("seq") FROM "ApplicationItem"), 0));
ALTER SEQUENCE "ApplicationItem_seq_seq" OWNED BY "ApplicationItem"."seq";
CREATE UNIQUE INDEX "ApplicationItem_seq_key" ON "ApplicationItem"("seq");

-- Coupon
ALTER TABLE "Coupon" ADD COLUMN "seq" INTEGER;
CREATE SEQUENCE "Coupon_seq_seq";
UPDATE "Coupon" e SET "seq" = t.rn
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn FROM "Coupon") t
WHERE e."id" = t."id";
ALTER TABLE "Coupon" ALTER COLUMN "seq" SET NOT NULL;
ALTER TABLE "Coupon" ALTER COLUMN "seq" SET DEFAULT nextval('"Coupon_seq_seq"');
SELECT setval('"Coupon_seq_seq"', COALESCE((SELECT MAX("seq") FROM "Coupon"), 0));
ALTER SEQUENCE "Coupon_seq_seq" OWNED BY "Coupon"."seq";
CREATE UNIQUE INDEX "Coupon_seq_key" ON "Coupon"("seq");

-- AdvertisingRequest
ALTER TABLE "AdvertisingRequest" ADD COLUMN "seq" INTEGER;
CREATE SEQUENCE "AdvertisingRequest_seq_seq";
UPDATE "AdvertisingRequest" e SET "seq" = t.rn
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn FROM "AdvertisingRequest") t
WHERE e."id" = t."id";
ALTER TABLE "AdvertisingRequest" ALTER COLUMN "seq" SET NOT NULL;
ALTER TABLE "AdvertisingRequest" ALTER COLUMN "seq" SET DEFAULT nextval('"AdvertisingRequest_seq_seq"');
SELECT setval('"AdvertisingRequest_seq_seq"', COALESCE((SELECT MAX("seq") FROM "AdvertisingRequest"), 0));
ALTER SEQUENCE "AdvertisingRequest_seq_seq" OWNED BY "AdvertisingRequest"."seq";
CREATE UNIQUE INDEX "AdvertisingRequest_seq_key" ON "AdvertisingRequest"("seq");
