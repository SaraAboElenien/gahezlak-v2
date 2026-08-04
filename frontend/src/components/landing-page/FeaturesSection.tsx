import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  BarChart3,
  Bot,
  Clock,
  CreditCard,
  QrCode,
  Smartphone,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export default function FeaturesSection() {
  const { t } = useTranslation();

  const features = [
    {
      icon: QrCode,
      title: t("landing.features.digitalMenus.title"),
      description: t("landing.features.digitalMenus.description"),
      color: "#e5422a",
    },
    {
      icon: Smartphone,
      title: t("landing.features.phoneOrders.title"),
      description: t("landing.features.phoneOrders.description"),
      color: "#008080",
    },
    {
      icon: BarChart3,
      title: t("landing.features.analytics.title"),
      description: t("landing.features.analytics.description"),
      color: "#ecb617",
    },
    {
      icon: CreditCard,
      title: t("landing.features.payments.title"),
      description: t("landing.features.payments.description"),
      color: "#0673eb",
    },
    {
      icon: Clock,
      title: t("landing.features.tracking.title"),
      description: t("landing.features.tracking.description"),
      color: "#F792CF",
    },
    {
      icon: Bot,
      title: t("landing.features.ai.title"),
      description: t("landing.features.ai.description"),
      color: "#857CD9",
    },
  ];
  function hexToRgba(hex: string, alpha = 0.2) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return (
    <div>
      {/* Features Section */}
      <section id="features" className=" px-6 lg:px-32 py-20 mt-4">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-10"
          >
            <h2 className="lg:text-4xl text-2xl font-semibold leading-tight mb-4 landing-page ">
              {t("landing.features.title")}
            </h2>
            <p className="lg:text-xl text-lg font-medium text-gray-700 mb-5 ">
              {t("landing.features.subtitle")}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
                className="group"
              >
                <Card className="w-full h-full card-background shadow-primary/10 border-lighter-primary/10 border">
                  <CardHeader className="text-center">
                    <div
                      style={{ backgroundColor: hexToRgba(feature.color, 0.5) }}
                      className="mx-auto mb-4 p-3 rounded-full w-16 h-16 flex items-center justify-center hover:bg-primary/50 transition-all duration-300"
                    >
                      <feature.icon className="h-8 w-8 group-hover:scale-110 transition-transform " />
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="leading-relaxed text-center">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
