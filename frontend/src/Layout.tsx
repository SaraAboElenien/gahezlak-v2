import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Cart from "./pages/restaurant/slug/Cart";
import Track from "./pages/restaurant/slug/Track";
import ResturantMenu from "./pages/restaurant/slug/ResturantMenu";
import ShopLayout from "./pages/restaurant/slug/ShopLayout";
import Demo from "./pages/restaurant/slug/Demo";
import Favourites from "./pages/restaurant/slug/Favourites";
import { CartProvider } from "./context/CartProvider";
import ProtectedDashboardRoute, {
  ProtectedCancelledRoute,
} from "./components/ProtectedDashboardRoute";
import ProtectedCheckoutSuccessRoute from "./components/ProtectedOrderStatusRoute";
import RedirectIfSubscribed from "./components/RedirectIfSubscribed";
import RedirectIfHasShop from "./components/RedirectIfHasShop";
import RedirectIfAuthenticated from "./components/RedirectIfAuthenticated";
import ProtectedRoute from "./components/ProtectedRoute";
import NotFound from "./pages/NotFound";
import OrderStatusPage from "./pages/restaurant/slug/OrderStatusPage";
import Loader from "./components/Loader";

// Code-split the auth/dashboard/admin-dashboard route trees so the
// highest-traffic public routes (home, public menu) don't pay for their
// bundle cost on first visit.
const AuthLayout = lazy(() => import("./pages/auth/AuthLayout"));
const Login = lazy(() => import("./pages/auth/pages/Login"));
const Register = lazy(() => import("./pages/auth/pages/Register"));
const CreateShop = lazy(() => import("./pages/auth/pages/CreateShop"));
const RequestResetPassword = lazy(() =>
  import("./pages/auth/pages/RequestReset").then((m) => ({
    default: m.RequestResetPassword,
  })),
);
const ResetPasswordForm = lazy(() =>
  import("./pages/auth/pages/ResetPassword-Form").then((m) => ({
    default: m.ResetPasswordForm,
  })),
);
const VerifyResetCode = lazy(() =>
  import("./pages/auth/pages/VerifyCode").then((m) => ({
    default: m.VerifyResetCode,
  })),
);
const SubscriptionForm = lazy(
  () => import("./pages/subscription/SubscriptionForm"),
);
const SubscriptionStatus = lazy(
  () => import("./pages/subscription/SubscriptionStatus"),
);

const DashboardLayout = lazy(() => import("./pages/dashboard/DashboardLayout"));
const Overview = lazy(() => import("./pages/dashboard/pages/Overview"));
const Analytics = lazy(() => import("./pages/dashboard/pages/Analytics"));
const Menu = lazy(() => import("./pages/dashboard/pages/Menu"));
const Orders = lazy(() => import("./pages/dashboard/pages/Orders"));
const Reports = lazy(() => import("./pages/dashboard/pages/Reports"));
const Subscription = lazy(() => import("./pages/dashboard/pages/Subscription"));
const Settings = lazy(() => import("./pages/dashboard/pages/Settings"));
const Staff = lazy(() => import("./pages/dashboard/pages/Staff"));
const SubscriptionCancelled = lazy(
  () => import("./pages/dashboard/pages/SubscriptionCancelled"),
);

const AdminDashboardLayout = lazy(
  () => import("./pages/admin-dashboard/AdminDashbordLayout"),
);
const AdminOverView = lazy(
  () => import("./pages/admin-dashboard/pages/AdminOverView"),
);
const AdminAnalytics = lazy(
  () => import("./pages/admin-dashboard/pages/AdminAnalytics"),
);
const AdminUsers = lazy(
  () => import("./pages/admin-dashboard/pages/AdminUsers"),
);
const AdminSubscriptions = lazy(
  () => import("./pages/admin-dashboard/pages/AdminSubscriptions"),
);
const AdminShops = lazy(
  () => import("./pages/admin-dashboard/pages/AdminShops"),
);
const AdminReports = lazy(
  () => import("./pages/admin-dashboard/pages/AdminReports"),
);

function Layout() {
  return (
    <>
      <CartProvider>
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            {/* rest-password */}
            <Route path="/auth" element={<AuthLayout />}>
              <Route
                index
                element={
                  <RedirectIfAuthenticated>
                    <Login />
                  </RedirectIfAuthenticated>
                }
              />
              <Route
                path="register"
                element={
                  <RedirectIfAuthenticated>
                    <Register />
                  </RedirectIfAuthenticated>
                }
              />
              <Route
                path="create-shop"
                element={
                  <RedirectIfHasShop>
                    <CreateShop />
                  </RedirectIfHasShop>
                }
              />
              <Route
                path="Request-ResetPassword"
                element={<RequestResetPassword />}
              />
              <Route path="verify" element={<VerifyResetCode />} />
              <Route path="reset-password" element={<ResetPasswordForm />} />
            </Route>

            {/* Subscription Form - Redirect if already subscribed */}
            <Route
              path="/auth/subscribe"
              element={
                <RedirectIfSubscribed>
                  <SubscriptionForm />
                </RedirectIfSubscribed>
              }
            />
            <Route path="auth/subscription" element={<SubscriptionStatus />} />

            {/* Dashboard - Protected by Subscription */}
            <Route
              path="/dashboard"
              element={
                <ProtectedDashboardRoute>
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                </ProtectedDashboardRoute>
              }
            >
              <Route index element={<Overview />} />
              <Route path="overview" element={<Overview />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="menu" element={<Menu />} />
              <Route path="orders" element={<Orders />} />
              <Route path="reports" element={<Reports />} />
              <Route path="subscription" element={<Subscription />} />
              <Route path="settings" element={<Settings />} />
              <Route path="staff" element={<Staff />} />
            </Route>

            <Route
              path="/admin-dashboard"
              element={
                <ProtectedRoute>
                  <AdminDashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminOverView />} />
              <Route path="overview" element={<AdminOverView />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="AdminReports" element={<AdminReports />} />
              <Route path="subscription" element={<AdminSubscriptions />} />
              <Route path="shops" element={<AdminShops />} />
            </Route>

            {/* Subscription Cancelled - Protected by cancelled route */}
            <Route
              path="/dashboard/subscription-cancelled"
              element={
                <ProtectedCancelledRoute>
                  <SubscriptionCancelled />
                </ProtectedCancelledRoute>
              }
            />
            {/* Restaurant Public Routes */}
            <Route path="/shops/:slug" element={<ShopLayout />}>
              <Route index element={<Demo />} />
              <Route path="menu" element={<ResturantMenu />} />
              <Route path="saved" element={<Favourites />} />
              <Route path="cart" element={<Cart />} />
              <Route
                path="orders/checkout/:orderNumber"
                element={
                  <ProtectedCheckoutSuccessRoute>
                    <OrderStatusPage />
                  </ProtectedCheckoutSuccessRoute>
                }
              />
              <Route path="track" element={<Track />} />
            </Route>

            {/* 404 Not Found Route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </CartProvider>
    </>
  );
}

export default Layout;
