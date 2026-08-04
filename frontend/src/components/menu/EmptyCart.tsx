import { ArrowRight, ShoppingBag } from "lucide-react";
import { Link, useParams } from "react-router-dom";

export default function EmptyCart() {
  const { slug } = useParams();

  const path = slug === "demo" ? `/shops/demo` : `/shops/${slug}/menu`;

  return (
    <>
      <div className="text-center py-16">
        <div className=" rounded p-12 shadow-lg max-w-md mx-auto">
          <ShoppingBag className="h-16 w-16 mx-auto mb-4 text-gray-700-content opacity-50" />
          <h2 className="text-2xl font-bold text-gray-700 mb-3">
            Cart is Empty
          </h2>
          <p className="text-gray-700-content mb-6">
            You haven't added any items to the shopping cart yet
          </p>
          <Link
            to={path}
            className="btn border-0 bg-menu-primary text-white btn-lg gap-2"
          >
            <ArrowRight className="h-5 w-5" />
            Browse the menu
          </Link>
        </div>
      </div>
    </>
  );
}
