-- Опрос может дарить прокрутку колеса (если колесо включено).
ALTER TABLE "Survey" ADD COLUMN     "giftSpin" BOOLEAN NOT NULL DEFAULT false;
