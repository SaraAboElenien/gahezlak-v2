import { Card, CardHeader, CardContent } from "../ui/card";
import { Star } from "lucide-react";
import { motion } from "framer-motion";

export default function TestimonialsSection() {
  const testimonials = [
    {
      name: "Ahmed Mohammed",
      restaurant: "Authenticity Restaurant",
      content:
        "Our sales increased by 40% after using this platform. Customers love the digital experience!",
      rating: 5,
      image:
        "https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=150",
    },
    {
      name: "Fatima Ali",
      restaurant: "Art Café",
      content:
        "Order organization became much easier, and the reports help me make better decisions.",
      rating: 5,
      image:
        "https://images.pexels.com/photos/3763188/pexels-photo-3763188.jpeg?auto=compress&cs=tinysrgb&w=150",
    },
    {
      name: "Khalid Al-Saeed",
      restaurant: "Sea Restaurant",
      content:
        "The platform is easy to use and customer service is excellent. I highly recommend it!",
      rating: 5,
      image:
        "https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=150",
    },
  ];

  return (
    <section id="testimonials" className=" px-6 lg:px-10 py-20 bg-white/50">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold text-kitchen-dark mb-4">
            What Our Customers Say
          </h2>
          <p className="text-xl text-kitchen-warm">
            Real experiences from restaurant owners who trust us
          </p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: index * 0.1 }}
            >
              <Card className="kitchen-card h-full">
                <CardHeader>
                  <div className="flex items-center space-x-4">
                    <img
                      src={testimonial.image}
                      alt={testimonial.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-kitchen-dark">
                        {testimonial.name}
                      </h3>
                      <p className="text-sm text-kitchen-warm">
                        {testimonial.restaurant}
                      </p>
                    </div>
                  </div>
                  <div className="flex">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-kitchen-primary text-kitchen-primary"
                      />
                    ))}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-kitchen-warm leading-relaxed">
                    "{testimonial.content}"
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
