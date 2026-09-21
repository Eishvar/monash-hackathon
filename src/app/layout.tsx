import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppSidebar } from "@/components/AppSidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Shippr", template: "%s · Shippr" },
  description: "AI-powered shipping document verification. Checks Shipping Instructions against draft Bills of Lading.",
  icons: { icon: "/shippr-logo.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <TooltipProvider>
          <div className="flex min-h-screen w-full">
            <AppSidebar />
            <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}
