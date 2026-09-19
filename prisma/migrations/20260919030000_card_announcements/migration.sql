-- Оповещение о новой карточке: отметка «уже объявлена». Колонка и бэкфилл — в одном блоке,
-- чтобы повторный запуск (ручной + деплой) не пометил объявленными карточки, появившиеся позже.
-- Уже опубликованные карточки считаем объявленными: при запуске не должна улететь лавина «новых» старых льгот.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'BenefitCard' AND column_name = 'announcedAt'
  ) THEN
    ALTER TABLE "BenefitCard" ADD COLUMN "announcedAt" TIMESTAMP(3);
    UPDATE "BenefitCard" SET "announcedAt" = NOW() WHERE "status" = 'PUBLISHED';
  END IF;
END $$;
