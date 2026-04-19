import type { Metadata } from "next";
import { AuthProvider } from "@/context/AuthContext";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TalkFlow",
  description: "A real-time messaging app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.className}`}
    >
      <body>
        <AuthProvider>
          <Analytics />
          <SpeedInsights />


          {children}
          <Toaster position="top-right" toastOptions={{
            duration: 3000,

          }} />
        </AuthProvider>
      </body>
    </html>
  );
}
