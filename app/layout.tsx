import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "一期一会ノベル",
  description: "みんなで選ぶ、ひとつの物語",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
