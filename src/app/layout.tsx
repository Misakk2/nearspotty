import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/components/i18n-provider";
import { QueryProvider } from "@/components/query-provider";
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

import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "NearSpotty - Find Your Perfect Meal, Matched to Your Diet",
  description: "AI-powered restaurant discovery for vegans, vegetarians, gluten-free, lactose-free, and every dietary need.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = (cookieStore.get("locale")?.value || "en") as "sk" | "en";

  return (
    <html lang={locale}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col bg-gray-50`}
      >
        <QueryProvider>
          <I18nProvider initialLocale={locale}>
            <AuthProvider>
              <AuthRedirect />
              <Navbar />
              {children}
              <Toaster position="bottom-right" />
            </AuthProvider>
          </I18nProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
