-- Фото в чате поддержки: ссылка на файл в Blob (сайт) или file_id Telegram (файл остаётся в боте).
ALTER TABLE "SupportMessage" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "tgFileId" TEXT;
