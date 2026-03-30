import type { Metadata } from "next";
import { AuthProvider } from "@/context/AuthContext";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DevChat",
  description: "A real-time chat for developers",
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

          {children}
          <Toaster position="top-right" toastOptions={{
            duration: 3000,

          }} />
        </AuthProvider>
      </body>
    </html>
  );
}
