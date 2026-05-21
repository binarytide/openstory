import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "Openbook",
  openGraph: {
    title: "Openbook",
    type: "website",
    locale: "en_US",
  },
};

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} antialiased tracking-tighter`}>{children}</body>
    </html>
  );
};

export default RootLayout;
