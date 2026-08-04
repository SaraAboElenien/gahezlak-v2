import Footer from "@/components/Footer";
import AboutUsSection from "@/components/landing-page/AboutUsSection";
import ContactUsSection from "@/components/landing-page/ContactUsSection";
import FAQSection from "@/components/landing-page/FAQSection";
import FeaturesSection from "@/components/landing-page/FeaturesSection";
import HeroSection3 from "@/components/landing-page/HeroSection3";
import PricingSection from "@/components/landing-page/PricingSection";
import Navbar from "@/components/Navbar";
import Seo from "@/components/Seo";

export default function Home() {
  return (
    <>
      <Seo
        title="Digital Menus & Online Ordering for Restaurants"
        description="QR-code digital menus, real-time order management, and a full shop dashboard for restaurants and shops. Get your restaurant online in minutes."
      />
      <Navbar />
      <HeroSection3 />
      <FeaturesSection />
      <PricingSection />
      <FAQSection />
      {/* <TestimonialsSection /> */}
      <AboutUsSection />
      <ContactUsSection />
      <Footer />
    </>
  );
}
