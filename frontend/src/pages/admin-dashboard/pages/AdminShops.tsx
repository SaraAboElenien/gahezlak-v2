import { useState, useCallback, useEffect } from "react";
import { AdminTable } from "@/components/admin-dashboard/AdminTable";
import type { Column } from "@/components/admin-dashboard/AdminTable";
import { useAdminShops } from "@/hooks/useAdminData";

interface Shop {
  _id: string;
  name: string;
  type: string;
  email: string;
  phoneNumber: string;
  address: {
    country: string;
    city: string;
    street: string;
  };
  members: Array<{
    _id?: string;
    userId: string;
    roleId: string;
  }>;
}

const AdminShopsPage = () => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 10;

  // Debounce search to reduce API calls
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to first page when searching
    }, 300);

    return () => clearTimeout(timeout);
  }, [search]);

  const handleSearchChange = useCallback((newSearch: string) => {
    setSearch(newSearch);
  }, []);

  // Use React Query for automatic data fetching and caching
  const { data, isLoading, error, isFetching } = useAdminShops(
    page,
    limit,
    debouncedSearch,
  );

  // Extract data from API response
  const shops = data?.data || [];
  const totalCount = data?.total || 0;

  const typeColors = {
    restaurant: "bg-green-100 text-green-800",
    cafe: "bg-blue-100 text-blue-800",
    bakery: "bg-yellow-100 text-yellow-800",
    fastfood: "bg-orange-100 text-orange-800",
    bar: "bg-purple-100 text-purple-800",
    casualdining: "bg-pink-100 text-pink-800",
  } as const;

  const columns: Column<Shop>[] = [
    {
      header: "Name",
      render: (shop: Shop) => (
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
            {shop.name.charAt(0)}
          </div>
          <span className="font-medium">{shop.name}</span>
        </div>
      ),
    },
    {
      header: "Type",
      render: (shop: Shop) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            typeColors[shop.type.toLowerCase() as keyof typeof typeColors] ||
            "bg-gray-100 text-gray-800"
          }`}
        >
          {shop.type}
        </span>
      ),
    },
    {
      header: "Email",
      accessor: "email",
    },
    {
      header: "Phone",
      accessor: "phoneNumber",
    },
    {
      header: "Address",
      render: (shop: Shop) => (
        <div className="text-sm">
          <div>{shop.address.street}</div>
          <div className="text-gray-500">
            {shop.address.city}, {shop.address.country}
          </div>
        </div>
      ),
    },
    {
      header: "Members",
      render: (shop: Shop) => {
        const memberCount = shop.members?.length || 0;

        // Color coding based on member count
        let badgeClasses = "px-3 py-1 text-xs font-medium rounded-full ";
        if (memberCount === 0) {
          badgeClasses += "bg-gray-100 text-gray-600";
        } else if (memberCount <= 5) {
          badgeClasses += "bg-green-100 text-green-800";
        } else if (memberCount <= 15) {
          badgeClasses += "bg-blue-100 text-blue-800";
        } else if (memberCount <= 30) {
          badgeClasses += "bg-orange-100 text-orange-800";
        } else {
          badgeClasses += "bg-red-100 text-red-800";
        }

        return (
          <span className={badgeClasses}>
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
        );
      },
    },
  ];

  return (
    <div className="p-6">
      <AdminTable
        title="Shops"
        data={shops}
        columns={columns}
        isLoading={isLoading}
        isSearching={isFetching && !isLoading}
        error={error?.message}
        currentPage={page}
        totalCount={totalCount}
        limit={limit}
        searchValue={search}
        onPageChange={setPage}
        onSearchChange={handleSearchChange}
      />
    </div>
  );
};

export default AdminShopsPage;
