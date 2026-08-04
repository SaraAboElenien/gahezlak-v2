import { Card, CardContent } from "../ui/card";
import { QrCode, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "../ui/button";
export default function DemoPreviewCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.3 }}
      className="mt-12"
    >
      <Card className="kitchen-card max-w-md mx-auto">
        <CardContent className="p-6 text-center">
          <div className="mb-4">
            <QrCode className="h-12 w-12 text-kitchen-primary mx-auto mb-3" />
          </div>
          <h3 className="text-lg font-bold text-kitchen-dark mb-2">
            See the Digital Menu Yourself!
          </h3>
          <p className="text-sm text-kitchen-warm mb-4">
            Explore how your restaurant menu will look to customers
          </p>
          <Button className="kitchen-button w-full">
            <Eye className="mr-2 h-4 w-4" />
            Free Interactive Demo
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
