-- Индексы под масштаб (тысячи сотрудников/заявок/купонов).
CREATE INDEX "Employee_fullName_idx" ON "Employee"("fullName");
CREATE INDEX "Employee_isActive_idx" ON "Employee"("isActive");

CREATE INDEX "Application_periodId_idx" ON "Application"("periodId");

CREATE INDEX "Coupon_periodId_idx" ON "Coupon"("periodId");
CREATE INDEX "Coupon_status_idx" ON "Coupon"("status");
CREATE INDEX "Coupon_employeeId_idx" ON "Coupon"("employeeId");
CREATE INDEX "Coupon_partnerId_idx" ON "Coupon"("partnerId");
