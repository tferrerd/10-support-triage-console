import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Support Triage Console",
  description:
    "Understand a support ticket, inspect uncertainty, and recommend its next queue.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
