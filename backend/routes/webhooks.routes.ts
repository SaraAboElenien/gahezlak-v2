import {
  handlePaymobOrdersWebhook,
  handlePaymobSubscriptionWebhook,
} from "../controllers/payment.webhook.controller";
import { Router } from "express";

const webhooksRoutes = Router();
webhooksRoutes.post("/paymob/subscriptions", handlePaymobSubscriptionWebhook);

// //for customer paying orders
webhooksRoutes.post("/paymob/orders", handlePaymobOrdersWebhook);

export default webhooksRoutes;

//disabled paymob integration for now
