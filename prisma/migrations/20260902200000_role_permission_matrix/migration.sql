-- Матрица прав в БД (редактируется на /admin/access). Заполняется значениями
-- из кода (src/lib/rbac.ts) — поведение в момент миграции не меняется.
CREATE TABLE "RolePermission" (
    "role" "Role" NOT NULL,
    "permission" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role", "permission")
);

INSERT INTO "RolePermission" ("role", "permission", "allowed", "updatedAt")
SELECT r.role, p.perm,
  CASE
    WHEN r.role = 'C_AND_B' AND p.perm IN (
      'cards.manage','partners.manage','periods.manage','applications.viewAll',
      'applications.decide','coupons.manage','reports.view','users.manage',
      'access.manage','audit.view'
    ) THEN true
    WHEN r.role = 'EMPLOYEE'   AND p.perm = 'application.select' THEN true
    WHEN r.role = 'CONTRACTOR' AND p.perm = 'coupons.confirm'    THEN true
    ELSE false
  END,
  now()
FROM (VALUES ('C_AND_B'::"Role"), ('EMPLOYEE'::"Role"), ('CONTRACTOR'::"Role")) AS r(role)
CROSS JOIN (VALUES
  ('cards.manage'), ('partners.manage'), ('periods.manage'), ('application.select'),
  ('applications.viewAll'), ('applications.decide'), ('coupons.manage'),
  ('coupons.confirm'), ('reports.view'), ('users.manage'), ('access.manage'), ('audit.view')
) AS p(perm);
