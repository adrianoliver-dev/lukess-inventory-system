import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const poppins = Poppins({
  weight: ["600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lukess Home | Sistema de Inventario",
  description: "Sistema profesional de gestión de inventario y ventas",
  keywords: ["inventario", "ventas", "POS", "gestión", "Bolivia"],
  robots: {
    index: false,
    follow: false,
  },
  verification: {
    google: "hAGIOlZimw756caps3CoODkM8yOwq_zXdj_JBxYosj4",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${poppins.variable}`}>
      <body className={inter.className}>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: "#09090b",
              color: "#fafafa",
              borderRadius: "12px",
              border: "1px solid #27272a",
              padding: "12px 16px",
              fontSize: "14px",
              fontWeight: "500",
            },
            success: {
              iconTheme: {
                primary: "#eab308", // gold-500
                secondary: "#09090b",
              },
            },
            error: {
              iconTheme: {
                primary: "#ef4444",
                secondary: "#fafafa",
              },
            },
          }}
        />
      </body>
    </html>
  );
}
