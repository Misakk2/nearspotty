import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/components/i18n-provider";
import Navbar from "@/components/navigation/Navbar";
import AuthRedirect from "@/components/navigation/AuthRedirect";
import { Toaster } from "react-hot-toast";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "NearSpotty - Find Your Perfect Meal, Matched to Your Diet",
  description: "AI-powered restaurant discovery for vegans, vegetarians, gluten-free, lactose-free, and every dietary need.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <I18nProvider>
          <AuthProvider>
            <AuthRedirect />
            <Navbar />
            {children}
            <Toaster position="bottom-right" />
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
