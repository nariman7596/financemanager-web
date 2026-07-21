import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinanceManager",
  description: "Take full control of your income, spending and investments.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
