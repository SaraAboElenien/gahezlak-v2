import { Outlet } from "react-router-dom";
import { BackgroundIcons } from "../../components/BackgroundIcons";
import Close from "../../components/Close";
import AuthSideSection from "../../components/AuthSideSection";
import Seo from "../../components/Seo";

export default function AuthLayout() {
  return (
    <>
      <Seo title="Sign In" noindex />
      <div className="relative overflow-hidden min-h-screen bg-gradient-to-br from-green-50 via-purple-50 to-green-50  dark:bg-black/85 flex items-center justify-center p-3 md:px-4 md:py-6 ">
        {/* Background Icons */}
        <BackgroundIcons />

        <div className=" relative w-full max-w-7xl flex rounded-2xl overflow-hidden shadow-xl bg-white  min-h-[700px]">
          {/* Close Button */}
          <Close to="/" />

          <AuthSideSection />

          <div className="relative w-full md:w-1/2 min-h-[80vh] md:min-h-[auto] p-4 py-10 md:p-10 card-background text-black flex justify-content-center items-center ">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  );
}
