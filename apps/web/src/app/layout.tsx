import type { Metadata } from "next";
import "./globals.css";
import { getLocale, getT } from "@/lib/i18n/server";
import { dirFor } from "@financemanager/i18n/config";
import { I18nProvider } from "@/lib/i18n/client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: "FinanceManager",
    description: "Take full control of your income, spending and investments.",
    // Opened from the Home Screen, the app runs in its own window (needed for
    // notifications on iOS).
    appleWebApp: { capable: true, title: t("app.name"), statusBarStyle: "default" },
    icons: { apple: "/pwa-icon/180", icon: "/pwa-icon/192" },
  };
}

// Runs before paint to set the theme class, preventing a flash of the wrong
// theme. Reads the saved preference, falling back to the OS setting.
const themeInit = `
(function(){try{
  var t = localStorage.getItem('theme');
  var dark = t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
}catch(e){}})();
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html lang={locale} dir={dirFor(locale)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
