import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { TelegramChrome } from "@/components/telegram-chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "Кафетерий льгот «Фаровон»",
  description: "Платформа выбора и получения корпоративных льгот",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1615" },
  ],
};

// Ставит data-theme до отрисовки — без вспышки светлой темы у выбравших тёмную.
const THEME_INIT = `try{var t=localStorage.getItem('faravon.theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
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
