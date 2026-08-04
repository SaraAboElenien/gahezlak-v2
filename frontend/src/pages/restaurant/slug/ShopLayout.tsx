import MobileNav from "@/components/menu/MenuMobileNavbar";
import MenuNavbar from "@/components/menu/MenuNavbar";
import { useCart } from "@/hooks/use-cart";
import { Outlet, useParams } from "react-router-dom";
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import Sidebar from "@/components/menu/Sidebar";
import Seo from "@/components/Seo";
import { usePublicShopDetails } from "@/hooks/usePublicShopData";

export default function ShopLayout() {
  const [showSidebar, setShowSidebar] = useState(false);
  const { cartItems, favourites } = useCart();
  const { slug } = useParams();

  // Fetch shop data from API
  const { data: shopDetailsResponse, isLoading } = usePublicShopDetails(slug!);
  const shopData = shopDetailsResponse?.data;

  // JSON-LD structured data for search-engine rich results (star ratings /
  // menu snippets aren't available since we have no rating/menu-price data
  // wired in here, but name/address/image is enough for a valid Restaurant
  // entity). Only emitted once real shop data has loaded.
  const jsonLd = shopData
    ? {
        "@context": "https://schema.org",
        "@type": "Restaurant",
        name: shopData.name,
        image: shopData.logoUrl || undefined,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        servesCuisine: shopData.type,
        address: {
          "@type": "PostalAddress",
          streetAddress: shopData.address?.street,
          addressLocality: shopData.address?.city,
          addressCountry: shopData.address?.country,
        },
      }
    : null;

  return (
    <>
      {shopData && (
        <>
          <Seo
            title={`${shopData.name} — Menu & Online Ordering`}
            description={`Order online from ${shopData.name}, ${shopData.type} in ${shopData.address?.city}, ${shopData.address?.country}. View the full menu and order now on Gahezlak.`}
            image={shopData.logoUrl}
          />
          {jsonLd && (
            <Helmet>
              <script type="application/ld+json">
                {JSON.stringify(jsonLd)}
              </script>
            </Helmet>
          )}
        </>
      )}
      <MenuNavbar
        onMenuToggle={() => setShowSidebar(true)}
        cartItems={cartItems.length}
        shopData={shopData}
        isLoading={isLoading}
      />
      {/* Sidebar - Only show on medium screens and larger */}
      <div className="hidden md:block">
        <Sidebar isOpen={showSidebar} onClose={() => setShowSidebar(false)} />
      </div>
      <div className="wrapper min-h-screen pt-5 pb-20 bg-gray-50">
        <Outlet />
      </div>

      {/* Mobile Bottom Navigation - Only show on small screens */}
      <div className="md:hidden">
        <MobileNav cartItmes={cartItems.length} favourites={favourites} />
      </div>
    </>
  );
}
