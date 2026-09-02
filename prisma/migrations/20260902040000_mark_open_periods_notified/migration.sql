-- Действующие открытые окна помечаем «уведомление об открытии уже отправлено»,
-- чтобы cron §5.10 не разослал его задним числом.
UPDATE "Period" SET "windowOpenNotifiedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'OPEN' AND "windowOpenNotifiedAt" IS NULL;
