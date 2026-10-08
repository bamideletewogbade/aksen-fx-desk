import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { OptionalClerkProvider } from "@/components/optional-clerk";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Every operator page depends on who is signed in and reads the database, so nothing is pre-rendered at build time.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Aksen OTC",
  description: "Desk software for licensed currency operators: customer quote links, payment checks against your statement, two-person payout approval and daily reconciliation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clerkEnabled = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <OptionalClerkProvider enabled={clerkEnabled}>{children}</OptionalClerkProvider>
      </body>
    </html>
  );
}
