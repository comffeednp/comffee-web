// Single source of truth for the top-bar navigation. Consumed by both the desktop Header
// (src/components/site/Header.tsx) and the mobile drawer (src/components/site/MobileNav.tsx)
// so the two never drift apart.

export interface NavChild {
  href: string;
  label: string;
}

export interface NavItem {
  label: string;
  /** Direct destination. Omitted when the item is a dropdown (use `children` instead). */
  href?: string;
  /** When present, the item renders as a dropdown and `href` is ignored. */
  children?: NavChild[];
  /** Renders the item as a glowing, shining amber pill so it stands out in the headbar. */
  highlight?: boolean;
  /** Small promo chip shown next to the label (e.g. "8% OFF"). Update if the discount changes. */
  badge?: string;
}

export const navLinks: NavItem[] = [
  {
    // "Branches" is a dropdown grouping every kind of location you can find through Comffee.
    label: "Branches",
    children: [
      // The full overview (Comffee cafes + Playcation stays) — "Every Comffee location".
      { href: "/branches", label: "All Locations" },
      // Comffee-brand internet cafes.
      { href: "/internet-cafe", label: "Internet Cafe" },
      // "Partner Cafes" = independent internet cafes that bought the Comffee POS as SaaS. Empty
      // until the first partner is approved through the POS Reservation tab. [[comffee-saas-vision]]
      { href: "/partners", label: "Partner Cafes" },
    ],
  },
  { label: "Playcation", href: "/playcation" },
  { label: "Menu", href: "/menu" },
  // Valorant/League points store — customer pays online, staff fulfil on Codashop. [[game-topups]]
  // highlight = shining amber pill: this is the new money-maker, make it impossible to miss.
  { label: "Game Top-Ups", href: "/game-topups", highlight: true, badge: "8% OFF" },
  // Cafe owners: download the Comffee POS installer (SaaS product). [[comffee-saas-vision]]
  { label: "Software", href: "/softwares" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];
