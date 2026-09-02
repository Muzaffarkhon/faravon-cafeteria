import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { TelegramChrome } from "@/components/telegram-chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "Кафетерий льгот «Фаровон»",
  description: "Платформа выбора и получения корпоративных льгот",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="h-full antialiased">
      {/* suppressHydrationWarning: расширения браузера (антибаннеры, менеджеры
          паролей) дописывают атрибуты в <body> до гидратации — это не наш рассинхрон */}
      <body className="min-h-full bg-canvas text-ink" suppressHydrationWarning>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
        <TelegramChrome />
        {children}
      </body>
    </html>
  );
}
