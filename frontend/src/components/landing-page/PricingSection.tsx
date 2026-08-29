import { motion } from "framer-motion";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Check, Star, Zap, Gift, Loader2 } from "lucide-react";
import { useAdvertisedPlan } from "../../hooks/usePlans";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function PricingSection() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: plan, isLoading, error } = useAdvertisedPlan();

  // Show loading state
  if (isLoading) {
    return (
      <section
        id="pricing"
        className="py-20 px-6 lg:px-32 bg-neutral-primary/20"
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-lg text-gray-600">
                {t("landing.pricing.loading")}
              </span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Show error state
  if (error) {
    return (
      <section
        id="pricing"
        className="py-20 px-6 lg:px-32 bg-neutral-primary/20"
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <p className="text-lg text-red-600 mb-4">
                {t("landing.pricing.error")}
              </p>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
              >
                {t("landing.pricing.retry")}
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Show no data state
  if (!plan) {
    return (
      <section
        id="pricing"
        className="py-20 px-6 lg:px-32 bg-neutral-primary/20"
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <p className="text-lg text-gray-600 mb-4">
                {t("landing.pricing.noPlans")}
              </p>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
              >
                {t("landing.pricing.refresh")}
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="pricing" className="py-20 px-6 lg:px-32 bg-neutral-primary/20">
      <div className="container mx-auto px-4">
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Column - Headline and Description */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-8 self-start mt-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-primary/20 to-primary/10 px-4 py-2 rounded-full mb-3 shadow"
            >
              <Gift className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary ">
                {t("landing.pricing.freeTrialBadge.grabYour")}{" "}
                {plan.trialPeriodDays}-
                {t("landing.pricing.freeTrialBadge.dayFreeTrial")}
              </span>
            </motion.div>

            <div className="space-y-6">
              <h2 className="text-2xl lg:text-3xl xl:text-5xl font-semibold leading-tight mb-4">
                {t("landing.pricing.title")}
              </h2>
              <p className="text-lg lg:text-xl font-medium leading-relaxed text-gray-700">
                {t("landing.pricing.subtitle.start")} {plan.trialPeriodDays}{" "}
                {t("landing.pricing.subtitle.end")}
              </p>
            </div>

            {/* Trust indicators */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="hidden lg:block"
            >
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 text-sm text-accent-foreground">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span>
                    {t("landing.pricing.trustIndicators.freeSupport")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span>
                    {t("landing.pricing.trustIndicators.continuousUpdates")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span>
                    {t("landing.pricing.trustIndicators.dataSecurity")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span>
                    {t("landing.pricing.trustIndicators.cancelAnytime")}
                  </span>
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Right Column - Pricing Card */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative"
          >
            {/* Free trial badge */}
            <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 z-10 max-w-7xl">
              <div className="bg-gradient-to-r from-lighter-primary to-lighter-primary text-white px-0 lg:px-5 py-3 rounded-full text-sm font-bold shadow-lg w-full lg:w-auto text-center">
                🎉 {plan.trialPeriodDays}{" "}
                {t("landing.pricing.trialBadge.daysFree")} {plan.price}
                {plan.currency}
                {t("landing.pricing.trialBadge.per")}
                {plan.frequency}
              </div>
            </div>

            <Card className=" border-2 border-primary/20 shadow-2xl rounded-3xl overflow-hidden hover:!bg-white bg-white ">
              <CardHeader className="text-center pb-4 pt-10 bg-gradient-to-br from-white to-primary/5 ">
                <CardTitle className="text-2xl lg:text-5xl font-bold mb-2">
                  {plan.planGroup}
                  {/* <p className="text-lg text-gray-700">{plan.title}</p> */}
                </CardTitle>

                {/* Price display */}
                <div className="mb-2">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl lg:text-5xl font-bold text-primary">
                      {plan.price}
                    </span>
                    <span className="text-accent-foreground text-lg">
                      {plan.currency}
                    </span>
                    <span className="text-accent-foreground text-lg ">
                      /{plan.frequency}
                    </span>
                  </div>
                </div>

                <CardDescription className="text-accent-foreground text-base lg:text-lg max-w-lg mx-auto">
                  {plan.description}
                </CardDescription>

                {/* -----------STATIC--------------*/}
                {/* Highlights */}
                <div className="flex flex-wrap justify-center gap-4 lg:gap-4 mt-6 pt-6 border-t border-primary/10">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                    className="flex items-center gap-2"
                  >
                    <Star className="h-4 w-4 text-primary" />
                    <span className="text-sm text-accent-foreground">
                      Most loved by restaurants
                    </span>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                    className="flex items-center gap-2"
                  >
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm text-accent-foreground">
                      Setup in under 10 minutes
                    </span>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.7 }}
                    className="flex items-center gap-2"
                  >
                    <Gift className="h-4 w-4 text-primary" />
                    <span className="text-sm text-accent-foreground">
                      No setup fees
                    </span>
                  </motion.div>
                </div>
              </CardHeader>

              <CardContent className="pt-0 px-6 lg:px-8 pb-8">
                {/* Features grid */}
                <div className="grid grid-cols-1 gap-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: 0.6 + index * 0.05 }}
                      className="flex items-center gap-3"
                    >
                      <div className="bg-green-100 rounded-full p-1 flex-shrink-0">
                        <Check className="h-3 w-3 text-green-600" />
                      </div>
                      <span className=" text-sm font-medium">{feature}</span>
                    </motion.div>
                  ))}
                </div>

                {/* CTA Button */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 1 }}
                  className="space-y-4"
                >
                  <Button
                    className="w-full btn-gradient text-base lg:text-lg py-4 lg:py-6 rounded-2xl font-bold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                    size="lg"
                    onClick={() => navigate("/auth/register")}
                  >
                    {t("landing.pricing.ctaButton.start")}{" "}
                    {plan.trialPeriodDays}-
                    {t("landing.pricing.ctaButton.dayFreeTrial")}
                  </Button>

                  {/* <div className="text-center">
                    <p className="text-sm text-accent-foreground">
                      No credit card required • Cancel anytime • Full access
                      during trial
                    </p>
                  </div> */}
                </motion.div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Bottom trust indicators for mobile */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="text-center mt-12 lg:hidden"
        >
          <div className="flex flex-wrap justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span>{t("landing.pricing.trustIndicators.freeSupport")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span>
                {t("landing.pricing.trustIndicators.continuousUpdates")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span>{t("landing.pricing.trustIndicators.dataSecurity")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span>{t("landing.pricing.trustIndicators.cancelAnytime")}</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
