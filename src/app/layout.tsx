import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { getSiteSettings } from "@/lib/settings";
import TopLoadingBar from "@/components/site/TopLoadingBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const name = settings?.company_name ?? "Comffee Drink and Play";
  const tagline =
    settings?.tagline ??
    "Internet cafes and gaming staycations across the Philippines.";
  return {
    title: {
      default: name,
      template: `%s · ${name}`,
    },
    description: tagline,
    metadataBase: new URL(settings?.site_url ?? "http://localhost:3000"),
    openGraph: {
      title: name,
      description: tagline,
      type: "website",
      siteName: name,
      images: ["/comffee-logo.png"],
    },
    twitter: { card: "summary_large_image", title: name, description: tagline },
    icons: { icon: "/favicon-512.png", apple: "/favicon-512.png" },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0a0807" />
        <link rel="icon" href="/favicon-512.png" type="image/png" sizes="512x512" />
        <link rel="apple-touch-icon" href="/favicon-512.png" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-cream selection:bg-phosphor selection:text-bg">
        <TopLoadingBar />
        <a href="#main-content" className="skip-link">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
