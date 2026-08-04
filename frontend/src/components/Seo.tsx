import { Helmet } from "react-helmet-async";

const SITE_NAME = "Gahezlak";
const DEFAULT_DESCRIPTION =
  "Gahezlak is a digital menu and ordering platform for restaurants and shops: QR-code menus, real-time order management, and a full shop dashboard.";

interface SeoProps {
  title: string;
  description?: string;
  image?: string;
  /** Private/authenticated pages (auth, dashboard, admin-dashboard) shouldn't be indexed. */
  noindex?: boolean;
}

// Sets the per-route <title>/description/OG/Twitter tags for browsers and
// JS-executing crawlers (Googlebot). Non-JS crawlers and link-preview
// scrapers never run React at all, so they only ever see index.html's
// static defaults — this can't reach them. See index.html's comment.
export default function Seo({
  title,
  description = DEFAULT_DESCRIPTION,
  image,
  noindex,
}: SeoProps) {
  const fullTitle = `${title} | ${SITE_NAME}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta
        name="robots"
        content={noindex ? "noindex, nofollow" : "index, follow"}
      />

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      {image && <meta property="og:image" content={image} />}

      <meta
        name="twitter:card"
        content={image ? "summary_large_image" : "summary"}
      />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {image && <meta name="twitter:image" content={image} />}
    </Helmet>
  );
}
