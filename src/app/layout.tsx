import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinanceManager",
  description: "Take full control of your income, spending and investments.",
};

// Runs before paint to set the theme class, preventing a flash of the wrong
// theme. Reads the saved preference, falling back to the OS setting.
const themeInit = `
(function(){try{
  var t = localStorage.getItem('theme');
  var dark = t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
}catch(e){}})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
