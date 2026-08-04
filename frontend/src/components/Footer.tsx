import { scrollToSection } from "@/utils/scrollToSection";
import { useTranslation } from "react-i18next";

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="bg-accent-foreground text-white py-12 px-4 lg:px-32">
      <div className="container mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-start w-full gap-8 lg:gap-12">
          {/* Logo/Description - Full width on small/medium, part of row on large */}
          <div className="w-full lg:w-auto text-center lg:text-left mb-8 lg:mb-0">
            <div className="flex items-center justify-center lg:justify-start space-x-2 mb-4">
              <div className="flex items-center">
                <img
                  src="/qr-hand.png"
                  width="30px"
                  alt="logo"
                  className="me-2"
                />
                <span
                  className="text-3xl"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 200,
                  }}
                >
                  {t("gahez")}
                  <span style={{ fontWeight: 400, fontStyle: "italic" }}>
                    {t("lak")}
                  </span>
                </span>
              </div>
            </div>
            <p className="text-gray-300 mb-4 text-sm sm:text-base max-w-lg mx-auto lg:mx-0">
              {t("landing.footer.description")}
            </p>
          </div>

          {/* Explore and Company - Side by side on small/medium, continue row on large */}
          <div className="flex flex-row lg:flex-1 lg:gap-12 gap-8 justify-center lg:justify-start">
            {/* Explore */}
            <div className="flex-1 text-center lg:text-left flex flex-col items-center lg:items-start">
              <h3 className="font-semibold mb-6 text-base sm:text-lg">
                {t("landing.footer.explore")}
              </h3>
              <ul className="space-y-2 text-gray-300">
                <li>
                  <button
                    onClick={() => scrollToSection("features")}
                    className="hover:text-primary transition-colors text-sm sm:text-base cursor-pointer"
                  >
                    {t("landing.footer.features")}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection("pricing")}
                    className="hover:text-primary transition-colors text-sm sm:text-base cursor-pointer"
                  >
                    {t("landing.footer.pricing")}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection("faq")}
                    className="hover:text-primary transition-colors text-sm sm:text-base cursor-pointer"
                  >
                    {t("landing.footer.faq")}
                  </button>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div className="flex-1 text-center lg:text-left flex flex-col items-center lg:items-start">
              <h3 className="font-semibold mb-6 text-base sm:text-lg">
                {t("landing.footer.company")}
              </h3>
              <ul className="space-y-2 text-gray-300">
                <li>
                  <button
                    onClick={() => scrollToSection("about")}
                    className="hover:text-blue-400 transition-colors text-sm sm:text-base cursor-pointer"
                  >
                    {t("landing.footer.aboutUs")}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection("contact")}
                    className="hover:text-blue-400 transition-colors text-sm sm:text-base cursor-pointer"
                  >
                    {t("landing.footer.contactUs")}
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-gray-600 mt-8 pt-8 text-center text-gray-300">
          <p className="text-sm sm:text-base">
            {t("landing.footer.copyright")}
          </p>
        </div>
      </div>
    </footer>
  );
}
