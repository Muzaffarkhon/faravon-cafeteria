import type { Metadata, Viewport } from "next";
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
        {children}
      </body>
    </html>
  );
}
