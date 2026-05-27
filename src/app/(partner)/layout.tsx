import Footer from "@/components/site/Footer";
import { getSiteSettings } from "@/lib/settings";

// Minimal partner shell: NO marketing Header / chat / cart — the owner asked for
// "just the map and the footer details below". Reuses the site Footer so the
// attendance page still carries the brand + contact details.
export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSiteSettings();
  return (
    <>
      <main id="main-content">{children}</main>
      <Footer settings={settings} />
    </>
  );
}
