import { useEffect, useState } from "react";
import { ShoppingBag, User, Phone, CreditCard, DollarSign } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import EmptyCart from "@/components/menu/EmptyCart";
import CartItem from "@/components/menu/CartItem";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createCustomerSchema,
  type CustomerFormData,
} from "@/types/validations/shop/customerSchema";

import { useParams, useNavigate } from "react-router-dom";
import { usePublicShopDetails } from "@/hooks/usePublicShopData";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";

const Cart = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { currentLang } = useLang();
  const { t } = useTranslation();

  const { data: shopData } = usePublicShopDetails(slug || "");

  const {
    cartItems,
    updateQuantity,
    removeItem,
    handleCheckout,
    getSubtotal,
    // getTotalVat,
    getTotalDiscount,
    getFinalTotal,
  } = useCart();

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create schema based on current language
  const customerSchema = createCustomerSchema(currentLang as "en" | "ar");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      paymentMethod: "Cash",
    },
  });

  const subtotal = getSubtotal();
  // const totalVat = getTotalVat();
  const totalDiscount = getTotalDiscount();
  const total = getFinalTotal(); // Use final total for display

  const onSubmit = async (data: CustomerFormData) => {
    if (!shopData?.data?.name) {
      console.error("Shop data not available");
      toast.error(
        currentLang === "ar"
          ? "بيانات المتجر غير متوفرة. يرجى المحاولة مرة أخرى."
          : "Shop data not available. Please try again.",
      );
      return;
    }

    // Process the data based on order type
    const processedData = {
      ...data,
      // Only include tableNumber if it's dineIn, otherwise set to undefined
      tableNumber: data.orderType === "dineIn" ? data.tableNumber : undefined,
    };

    setIsSubmitting(true);
    try {
      // !!Call the create order API
      const orderResponse: { iframeUrl: string } = await handleCheckout(
        processedData,
        shopData.data.name,
      );

      if (data.paymentMethod === "Cash") {
        // For cash payment, redirect to success page
        // Order number is already stored in localStorage by handleCheckout
        // We need to get the order number from localStorage to construct the URL
        const storedOrderNumber = localStorage.getItem("lastOrderNumber");
        if (storedOrderNumber) {
          navigate(`/shops/${slug}/orders/checkout/${storedOrderNumber}`);
        } else {
          // Show error toast instead of redirecting to non-existent route
          toast.error(
            currentLang === "ar"
              ? "لم يتم العثور على رقم الطلب. يرجى المحاولة مرة أخرى."
              : "Order number not found. Please try placing your order again.",
          );
        }
      } else {
        // For CreditCard payment, redirect to Paymob iframe
        const iframeUrl = orderResponse.iframeUrl;
        window.location.href = iframeUrl;
      }
    } catch (error) {
      console.error("Error during checkout:", error);
      toast.error(
        currentLang === "ar"
          ? "حدث خطأ أثناء إنشاء الطلب. يرجى المحاولة مرة أخرى."
          : "An error occurred while creating the order. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const orderType = watch("orderType");

  useEffect(() => {
    if (orderType === "takeaway") {
      // Reset tableNumber if takeaway is selected
      setValue("tableNumber", undefined);
    }
  }, [orderType, setValue]);

  return (
    <>
      <div className="min-h-screen py-8 sm:py-12 md:py-16 lg:py-20 bg-gray-50">
        {/* Header */}

        <div className="max-w-7xl mx-auto">
          {cartItems.length === 0 ? (
            // Empty Cart State
            <EmptyCart />
          ) : (
            // Cart with Items
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Items Section */}
              <div className="lg:col-span-2 bg-white rounded-lg shadow-sm">
                <div className="p-7">
                  <h2 className="text-2xl font-bold text-gray-700 mb-6 flex items-center gap-3">
                    <ShoppingBag className="h-6 w-6 text-primary" />
                    {t("publicMenu.requiredItems")} ({cartItems.length})
                  </h2>

                  <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                    {cartItems.map((item) => (
                      <CartItem
                        key={item.uniqueId || item.id}
                        item={item}
                        updateQuantity={updateQuantity}
                        removeItem={removeItem}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Order Form and Summary - Fixed Position */}
              <div className="lg:col-span-1">
                <div className="sticky top-24">
                  <form
                    onSubmit={handleSubmit(onSubmit)}
                    className="bg-gradient-to-br from-primary to-lighter-primary p-8 text-white rounded-lg shadow-2xl"
                  >
                    <div className="space-y-8">
                      {/* Customer Information Section */}
                      <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                          <User className="h-5 w-5 text-green-400" />
                          {t("publicMenu.customerInformation")}
                        </h3>

                        <div className="space-y-5">
                          <div>
                            <label
                              htmlFor="firstName"
                              className="block text-sm font-medium text-gray-300 mb-2"
                            >
                              {currentLang === "ar"
                                ? "الاسم الأول"
                                : "First Name"}{" "}
                              *
                            </label>
                            <div className="relative">
                              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-20 pointer-events-none">
                                <User className="text-gray-400 w-4 h-4" />
                              </div>
                              <input
                                id="firstName"
                                type="text"
                                placeholder={
                                  currentLang === "ar"
                                    ? "الاسم الأول"
                                    : "First Name"
                                }
                                className="w-full px-4 py-3 pl-12 bg-white text-gray-900 border border-gray-600 rounded-lg focus:outline-none focus:border-green-400 transition-colors"
                                {...register("firstName")}
                              />
                            </div>
                            {errors.firstName && (
                              <span className="text-red-400 text-sm block mt-1">
                                {errors.firstName.message}
                              </span>
                            )}
                          </div>

                          <div>
                            <label
                              htmlFor="lastName"
                              className="block text-sm font-medium text-gray-300 mb-2"
                            >
                              {currentLang === "ar"
                                ? "اسم العائلة"
                                : "Last Name"}{" "}
                              *
                            </label>
                            <div className="relative">
                              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-20 pointer-events-none">
                                <User className="text-gray-400 w-4 h-4" />
                              </div>
                              <input
                                id="lastName"
                                type="text"
                                placeholder={
                                  currentLang === "ar"
                                    ? "اسم العائلة"
                                    : "Last Name"
                                }
                                className="w-full px-4 py-3 pl-12 bg-white text-gray-900 border border-gray-600 rounded-lg focus:outline-none focus:border-green-400 transition-colors"
                                {...register("lastName")}
                              />
                            </div>
                            {errors.lastName && (
                              <span className="text-red-400 text-sm block mt-1">
                                {errors.lastName.message}
                              </span>
                            )}
                          </div>

                          <div>
                            <label
                              htmlFor="phone"
                              className="block text-sm font-medium text-gray-300 mb-2"
                            >
                              {t("publicMenu.phoneNumber")} *
                            </label>
                            <div className="relative">
                              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-20 pointer-events-none">
                                <Phone className="text-gray-400 w-4 h-4" />
                              </div>
                              <input
                                id="phone"
                                type="tel"
                                placeholder="01xxxxxxxxx"
                                className="w-full px-4 py-3 pl-12 bg-white text-gray-900 border border-gray-600 rounded-lg focus:outline-none focus:border-green-400 transition-colors"
                                {...register("phone")}
                              />
                            </div>
                            {errors.phone && (
                              <span className="text-red-400 text-sm block mt-1">
                                {errors.phone.message}
                              </span>
                            )}
                          </div>

                          {/* Dine In / Takeaway Selection */}
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-3">
                              {currentLang === "ar"
                                ? "نوع الطلب"
                                : "Order Type"}{" "}
                              *
                            </label>
                            <div className="space-y-3">
                              <label className="flex items-center p-3 border border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700/50">
                                <input
                                  type="radio"
                                  value="dineIn"
                                  {...register("orderType")}
                                  className="mr-3"
                                />
                                <span className="font-medium">
                                  {currentLang === "ar"
                                    ? "تناول في المطعم"
                                    : "Dine In"}
                                </span>
                              </label>

                              <label className="flex items-center p-3 border border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700/50">
                                <input
                                  type="radio"
                                  value="takeaway"
                                  {...register("orderType")}
                                  className="mr-3"
                                />
                                <span className="font-medium">
                                  {currentLang === "ar"
                                    ? "طلب خارجي"
                                    : "Takeaway"}
                                </span>
                              </label>
                            </div>
                            {errors.orderType && (
                              <span className="text-red-400 text-sm block mt-1">
                                {errors.orderType.message}
                              </span>
                            )}
                          </div>

                          {/* Table Number Input - Only show when Dine In is selected */}
                          {watch("orderType") === "dineIn" && (
                            <div>
                              <label
                                htmlFor="tableNumber"
                                className="block text-sm font-medium text-gray-300 mb-2"
                              >
                                {t("publicMenu.tableNumber")}
                              </label>
                              <input
                                id="tableNumber"
                                type="number"
                                placeholder={t("publicMenu.enterTableNumber")}
                                className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-600 rounded-lg focus:outline-none focus:border-green-400 transition-colors"
                                {...register("tableNumber")}
                              />
                              {errors.tableNumber && (
                                <span className="text-red-400 text-sm block mt-1">
                                  {errors.tableNumber.message}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Payment Method Selection */}
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-3">
                              {currentLang === "ar"
                                ? "طريقة الدفع"
                                : "Payment Method"}{" "}
                              *
                            </label>
                            <div className="space-y-3">
                              <label className="flex items-center p-3 border border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700/50">
                                <input
                                  type="radio"
                                  value="Cash"
                                  {...register("paymentMethod")}
                                  className="mr-3"
                                />
                                <DollarSign className="h-5 w-5 text-green-400 mr-3" />
                                <span className="font-medium">
                                  {currentLang === "ar" ? "نقداً" : "Cash"}
                                </span>
                              </label>

                              <label className="flex items-center p-3 border border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700/50">
                                <input
                                  type="radio"
                                  value="CreditCard"
                                  {...register("paymentMethod")}
                                  className="mr-3"
                                />
                                <CreditCard className="h-5 w-5 text-blue-400 mr-3" />
                                <span className="font-medium">
                                  {currentLang === "ar"
                                    ? "دفع عبر Paymob"
                                    : "Pay via Paymob"}
                                </span>
                              </label>
                            </div>
                            {errors.paymentMethod && (
                              <span className="text-red-400 text-sm block mt-1">
                                {errors.paymentMethod.message}
                              </span>
                            )}
                          </div>

                          <div>
                            <label
                              htmlFor="customizationDetails"
                              className="block text-sm font-medium text-gray-300 mb-2"
                            >
                              {t("publicMenu.specialInstructions")}
                            </label>
                            <textarea
                              id="customizationDetails"
                              placeholder={t(
                                "publicMenu.specialInstructionsPlaceholder",
                              )}
                              className="w-full px-4 py-3  bg-white text-gray-900 border border-gray-600 rounded-lg  placeholder-gray-400 focus:outline-none focus:border-green-400 transition-colors resize-none"
                              rows={3}
                              {...register("customizationDetails")}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Order Summary Section */}
                      <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
                        <h3 className="text-xl font-bold text-white mb-6">
                          {t("publicMenu.orderSummary")}
                        </h3>

                        <div className="space-y-4">
                          <div className="flex justify-between items-center py-2 border-b border-gray-600">
                            <span className="text-gray-300">
                              {t("publicMenu.subtotal")}
                            </span>
                            <span className="font-semibold text-white">
                              {subtotal.toFixed(2)} EGP
                            </span>
                          </div>

                          {/* VAT calculation 
                      {totalVat > 0 && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-600">
                          <span className="text-gray-300">
                            {t("publicMenu.vat")} (14%)
                          </span>
                          <span className="font-semibold text-white">
                            {totalVat.toFixed(2)} EGP
                          </span>
                        </div>
                      )} */}

                          {totalDiscount > 0 && (
                            <div className="flex justify-between items-center py-2 border-b border-gray-600">
                              <span className="text-green-400">
                                {t("publicMenu.totalSavings")}
                              </span>
                              <span className="font-semibold text-green-400">
                                -{totalDiscount.toFixed(2)} EGP
                              </span>
                            </div>
                          )}

                          <div className="flex justify-between items-center pt-4 border-t-2 border-green-500">
                            <span className="text-lg font-bold text-white">
                              {t("publicMenu.totalAmount")}
                            </span>
                            <span className="text-xl font-bold text-green-400">
                              {total.toFixed(2)} EGP
                            </span>
                          </div>
                        </div>

                        {/* Checkout Button */}
                        <button
                          type="submit"
                          disabled={isSubmitting || slug === "demo"}
                          className="w-full mt-6 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-3 cursor-pointer"
                        >
                          <ShoppingBag className="h-5 w-5" />
                          {isSubmitting
                            ? t("publicMenu.creatingOrder")
                            : slug === "demo"
                              ? currentLang === "ar"
                                ? "غير متاح في العرض التجريبي"
                                : "Not available in demo"
                              : t("publicMenu.checkout")}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Cart;
