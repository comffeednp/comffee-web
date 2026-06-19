import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import GameTopupBanner from "@/components/site/GameTopupBanner";
import SmoothScroll from "@/components/site/SmoothScroll";
import ChatWidgetStub from "@/components/site/ChatWidgetStub";
import { CartProvider } from "@/components/cart/CartProvider";
import CartDrawer from "@/components/cart/CartDrawer";
import { getSiteSettings } from "@/lib/settings";

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSiteSettings();
  return (
    <CartProvider>
      <SmoothScroll />
      <Header settings={settings} />
      {/* Game Top-Ups promo — shown at the top of EVERY public page (links to the store). */}
      <GameTopupBanner />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer settings={settings} />
      <CartDrawer />
      <ChatWidgetStub />
    </CartProvider>
  );
}
