import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function FAQSection() {
  const { t } = useTranslation();
  const [openItems, setOpenItems] = useState<number[]>([]);

  const faqData = [
    {
      question: t("landing.faq.questions.what.question"),
      answer: t("landing.faq.questions.what.answer"),
    },
    {
      question: t("landing.faq.questions.qr.question"),
      answer: t("landing.faq.questions.qr.answer"),
    },
    {
      question: t("landing.faq.questions.customize.question"),
      answer: t("landing.faq.questions.customize.answer"),
    },
    {
      question: t("landing.faq.questions.app.question"),
      answer: t("landing.faq.questions.app.answer"),
    },
    {
      question: t("landing.faq.questions.payment.question"),
      answer: t("landing.faq.questions.payment.answer"),
    },
    {
      question: t("landing.faq.questions.platforms.question"),
      answer: t("landing.faq.questions.platforms.answer"),
    },
  ];

  const toggleItem = (index: number) => {
    setOpenItems((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  };

  return (
    <section
      id="faq"
      className="py-24 bg-gray-50/70 px-6 lg:px-32 relative overflow-hidden"
    >
      <div className="container mx-auto px-4 relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          {/* Left side */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="sticky top-8"
          >
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="text-5xl font-semibold text-black mb-6 leading-tight landing-page-faq"
            >
              {t("landing.faq.title")}
              <span className="block text-primary">
                {t("landing.faq.titleHighlight")}
              </span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-xl text-gray-600 mb-8 leading-relaxed"
            >
              {t("landing.faq.subtitle")}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="relative"
            >
              <img
                src="/FAQ.webp"
                alt="FAQ illustration"
                className="w-full max-w-xl rounded-2xl shadow border border-gray-200"
              />
            </motion.div>
          </motion.div>

          {/* Right side */}
          <div className="space-y-6 mt-4">
            {faqData.map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ scale: 1.01 }}
                className="relative"
              >
                <Card
                  className={`
                  overflow-hidden border-0 shadow hover:shadow-xl transition-all duration-300 bg-white/80 backdrop-blur-sm
                  ${openItems.includes(index) ? "border" : ""}
                `}
                >
                  <CardHeader
                    className="cursor-pointer  transition-all duration-300 relative"
                    onClick={() => toggleItem(index)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <CardTitle className="text-lg text-gray-800 text-left font-semibold leading-snug">
                          {faq.question}
                        </CardTitle>
                      </div>
                      <motion.div
                        animate={{
                          rotate: openItems.includes(index) ? 180 : 0,
                        }}
                        transition={{ duration: 0.3 }}
                        className="flex-shrink-0 p-2 rounded-full btn-gradient text-white shadow"
                      >
                        <ChevronDown className="h-5 w-5" />
                      </motion.div>
                    </div>
                  </CardHeader>

                  <AnimatePresence>
                    {openItems.includes(index) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: "easeInOut" }}
                      >
                        <CardContent className="pt-0 pb-6">
                          <motion.div
                            initial={{ y: -10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ duration: 0.3, delay: 0.1 }}
                            className="border-t border-gray-100 pt-4"
                          >
                            <CardDescription className="text-gray-600 leading-relaxed text-base">
                              {faq.answer}
                            </CardDescription>
                          </motion.div>
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
