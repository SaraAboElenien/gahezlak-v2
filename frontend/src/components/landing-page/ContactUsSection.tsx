import { Button } from "../ui/button";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Mail, MapPin, Phone, Send, Clock } from "lucide-react";
import { Textarea } from "../ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useContactAdmin } from "@/hooks/useReports";
import { AxiosError } from "axios";

// Validation schema using Zod
const contactFormSchema = z.object({
  senderFirstName: z
    .string()
    .min(2, "First Name must be at least 2 characters"),
  senderLastName: z.string().min(2, "Last Name must be at least 2 characters"),
  phoneNumber: z.string(),
  shopName: z.string(),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;

export default function ContactUsSection() {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
  });

  const { mutate: contactAdmin, isPending: adminLoading } = useContactAdmin();

  const onSubmit = async (data: ContactFormData) => {
    console.log("data:", data);
    try {
      contactAdmin(data, {
        onSuccess: (res) => {
          console.log("res.data:", res.data);
          toast.success("Message sent successfully!");
          reset();
        },
        onError: (err: unknown) => {
          console.error(" Error", err);
          const message =
            err instanceof AxiosError ? err.response?.data?.message : undefined;
          toast.error(
            `Failed to send message. ${message || t("common.errors.generic")}... Please try again.`,
          );
        },
      });
    } catch (error) {
      console.log(error);
      toast.error("Something went wrong. Please try again.");
    }

    // try {
    //   // Show loading toast
    //   const loadingToast = toast.loading("Sending your message...");

    //   // Send email using EmailJS
    //   const result = await emailjs.send(
    //     "service_nq70krx", // Your Service ID
    //     "template_f5984m6", // Your Template ID
    //     {
    //       senderName: data.senderName,
    //       senderEmail: data.senderEmail,
    //       phoneNumber: data.phoneNumber || "Not provided",
    //       shopName: data.shopName || "Not provided",
    //       message: data.message,
    //       from_name: data.senderName,
    //       timestamp: new Date().toLocaleString(),
    //     },
    //     "aD2a_twVyBFhYgqYB" // Your Public Key
    //   );

    //   // Dismiss loading toast
    //   toast.dismiss(loadingToast);

    //   if (result.status === 200) {
    //     toast.success(
    //       "Message sent successfully! We'll respond within 24 hours."
    //     );
    //     reset(); // Reset form
    //   } else {
    //     toast.error("Failed to send message. Please try again.");
    //   }
    // } catch (error) {
    //   console.error("EmailJS error:", error);
    //   toast.error("Failed to send message. Please try again later.");
    // }
  };

  return (
    <section id="contact" className=" px-6 lg:px-32 py-20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className=" mx-auto"
        >
          <div className="text-center mb-12">
            <div className="flex justify-center mb-6"></div>
            <h2 className="text-5xl font-semibold mb-4 landing-page-abt">
              {t("landing.contact.title")}
            </h2>
            <p className="text-xl text-gray-700">
              {t("landing.contact.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <Card className="hover:hover:!bg-transparent border-lighter-primary/20 border shadow-lighter-primary/10">
              <CardHeader className="pb-6">
                <CardTitle className="text-2xl">
                  {t("landing.contact.form.title")}
                </CardTitle>
                <CardDescription>
                  {t("landing.contact.form.subtitle")}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-sm font-medium">
                        {t("landing.contact.form.FirstName")}
                      </Label>
                      <Input
                        id="senderFirstName"
                        {...register("senderFirstName")}
                        placeholder={t(
                          "landing.contact.form.placeholders.name",
                        )}
                        className={`h-11 ${
                          errors.senderFirstName ? "border-red-500" : ""
                        }`}
                      />
                      {errors.senderFirstName && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors.senderFirstName.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="LastName" className="text-sm font-medium">
                        {t("landing.contact.form.LastName")}
                      </Label>
                      <Input
                        id="senderLastName"
                        {...register("senderLastName")}
                        placeholder={t("landing.contact.form.LastName")}
                        className={`h-11 ${
                          errors.senderLastName ? "border-red-500" : ""
                        }`}
                      />
                      {errors.senderLastName && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors.senderLastName.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-sm font-medium">
                        {t("landing.contact.form.phone")}
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        {...register("phoneNumber")}
                        placeholder={t(
                          "landing.contact.form.placeholders.phone",
                        )}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="restaurant"
                        className="text-sm font-medium"
                      >
                        {t("landing.contact.form.restaurant")}
                      </Label>
                      <Input
                        id="restaurant"
                        {...register("shopName")}
                        placeholder={t(
                          "landing.contact.form.placeholders.restaurant",
                        )}
                        className="h-11"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message" className="text-sm font-medium">
                      {t("landing.contact.form.message")}
                    </Label>
                    <Textarea
                      id="message"
                      {...register("message")}
                      placeholder={t(
                        "landing.contact.form.placeholders.message",
                      )}
                      rows={5}
                      className={`min-h-[120px] resize-none ${
                        errors.message ? "border-red-500" : ""
                      }`}
                    />
                    {errors.message && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.message.message}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="btn-gradient w-full gap-2 h-12 text-base font-medium"
                    disabled={adminLoading}
                  >
                    <Send className="h-5 w-5" />
                    {adminLoading
                      ? t("landing.contact.form.sending")
                      : t("landing.contact.form.send")}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Contact Info */}
            <div className="space-y-8">
              <Card className="shadow-lighter-primary/10 border-lighter-primary/20 border">
                <CardContent>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-primary/20 rounded-full flex items-center justify-center hover:bg-primary/50 transition-all duration-300">
                      <Mail className="h-6 w-6 group-hover:scale-110 transition-transform " />
                    </div>
                    <div>
                      <h3 className="font-semibold">Email</h3>
                      <p className="text-kitchen-warm">
                        {t("landing.contact.info.email")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-lighter-primary/10 border-lighter-primary/20 border">
                <CardContent>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-primary/20 rounded-full flex items-center justify-center hover:bg-primary/50 transition-all duration-300">
                      <Phone className="h-6 w-6 group-hover:scale-110 transition-transform " />
                    </div>

                    <div>
                      <h3 className="font-semibold">Phone</h3>
                      <p className="text-accent-foreground">
                        {t("landing.contact.info.phone")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-lighter-primary/10 border-lighter-primary/20 border">
                <CardContent>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-primary/20 rounded-full flex items-center justify-center hover:bg-primary/50 transition-all duration-300">
                      <MapPin className="h-6 w-6 group-hover:scale-110 transition-transform " />
                    </div>
                    <div>
                      <h3 className="font-semibold">Address</h3>
                      <p className="text-accent-foreground">
                        {t("landing.contact.info.address")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-lighter-primary/10 border-lighter-primary/20 border">
                <CardContent>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-primary/20 rounded-full flex items-center justify-center hover:bg-primary/50 transition-all duration-300">
                      <Clock className="h-6 w-6 group-hover:scale-110 transition-transform " />
                    </div>
                    <div>
                      <h3 className="font-semibold">Business Hours</h3>
                      <p className="text-accent-foreground">
                        {t("landing.contact.info.hours.weekdays")}
                      </p>
                      <p className="text-accent-foreground">
                        {t("landing.contact.info.hours.weekends")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
