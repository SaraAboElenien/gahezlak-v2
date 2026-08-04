import { motion } from "framer-motion";
import { Card, CardContent } from "../ui/card";
import { useTranslation } from "react-i18next";

const team = [
  {
    name: "Mohammed Hassan",
    role: "Frontend Developer",
    image:
      "https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=300",
  },
  {
    name: "Ahmed Ehab",
    role: "Backend Developer",
    image:
      "https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=300",
  },
  {
    name: "Yasser Sultan",
    role: "Frontend Developer",
    image:
      "https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=300",
  },
  {
    name: "Sara Abou Elenien",
    role: "Backend Developer",
    image:
      "https://images.pexels.com/photos/3763188/pexels-photo-3763188.jpeg?auto=compress&cs=tinysrgb&w=300",
  },
  {
    name: "Habiba Abdel Monem ",
    role: "Backend Developer",
    image:
      "https://images.pexels.com/photos/3763188/pexels-photo-3763188.jpeg?auto=compress&cs=tinysrgb&w=300",
  },
  {
    name: "Yara Abou Al Sood",
    role: "Frontend Developer",
    image:
      "https://images.pexels.com/photos/3763188/pexels-photo-3763188.jpeg?auto=compress&cs=tinysrgb&w=300",
  },
];

export default function AboutUsSection() {
  const { t } = useTranslation();

  return (
    <section
      id="about"
      className="px-4 sm:px-6 lg:px-28 py-16 sm:py-20 bg-neutral-primary/20"
    >
      <div className="container mx-auto px-4">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-8 sm:mb-12"
        >
          <h2 className="text-5xl font-semibold mb-6 landing-page-abt text-center">
            {t("landing.about.title")}
          </h2>
          <p className="text-base sm:text-lg md:text-xl max-w-4xl mx-auto leading-relaxed text-gray-700 mb-6 sm:mb-8 text-center">
            {t("landing.about.subtitle")}
          </p>

          {/* Our Story Section */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white shadow-xl rounded-3xl p-4 sm:p-6 lg:p-8 flex flex-col xl:flex-row items-center gap-4 sm:gap-6 xl:gap-10">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="w-full xl:w-1/2 px-2 sm:px-4 lg:px-6"
              >
                <p className="text-sm sm:text-base lg:text-lg leading-relaxed text-black space-y-4">
                  <span className="block">
                    <span className="text-lighter-primary text-base sm:text-lg lg:text-xl italic">
                      {t("landing.about.story.title")}
                    </span>{" "}
                    {t("landing.about.story.description")}
                  </span>
                  <span className="block mt-4 sm:mt-6">
                    {t("landing.about.story.mission")}
                  </span>
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="w-full xl:w-1/2"
              >
                <img
                  src="/header-1.jpg"
                  alt="About illustration"
                  className="w-full h-48 sm:h-64 md:h-72 lg:h-80 xl:h-[420px] object-cover rounded-2xl border border-gray-200 shadow-2xl"
                />
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Team Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-8 sm:mb-10"
        >
          <div className="text-center mb-8 sm:mb-12 mt-16 sm:mt-20">
            <h3 className="text-xl sm:text-2xl lg:text-3xl font-semibold mb-2 text-primary">
              {t("landing.about.team.title")}
            </h3>
            <p className="text-sm sm:text-base lg:text-xl text-gray-700">
              {t("landing.about.team.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {team.map((member, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
                className="h-full"
              >
                <Card className="text-center bg-white h-full min-h-[240px] sm:min-h-[280px] flex flex-col">
                  <CardContent className="p-4 sm:p-6 flex flex-col justify-center items-center flex-1">
                    <img
                      src={member.image}
                      alt={member.name}
                      className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-full object-cover mx-auto mb-3 sm:mb-4"
                    />
                    <h4 className="text-base sm:text-lg lg:text-xl font-bold text-kitchen-dark mb-1 sm:mb-2">
                      {member.name}
                    </h4>
                    <p className="text-xs sm:text-sm lg:text-base text-gray-600 font-medium">
                      {member.role}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
