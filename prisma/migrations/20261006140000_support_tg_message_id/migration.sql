-- message_id Telegram у сообщений чата поддержки — для настоящих ответов-цитат как в Telegram.
ALTER TABLE "SupportMessage" ADD COLUMN     "tgMessageId" INTEGER;
