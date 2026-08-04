import { useState, useCallback, useEffect } from "react";
import { AdminTable } from "@/components/admin-dashboard/AdminTable";
import type { Column } from "@/components/admin-dashboard/AdminTable";
import { useAdminUsers } from "@/hooks/useAdminData";

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: { name: string };
  shop?: { name: string };
}

const AdminUsersPage = () => {
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
  const { data, isLoading, error, isFetching } = useAdminUsers(
    page,
    limit,
    debouncedSearch,
  );

  // Extract data from API response
  const users = data?.data?.users || [];
  const totalCount = data?.data?.pagination?.total || 0;

  const roleColors = {
    admin: "bg-red-100 text-red-800",
    shop_owner: "bg-green-100 text-green-800",
    shop_manager: "bg-blue-100 text-blue-800",
    shop_staff: "bg-orange-100 text-orange-800",
    kitchen: "bg-yellow-100 text-yellow-800",
    user: "bg-purple-100 text-purple-800",
  } as const;

  const columns: Column<User>[] = [
    {
      header: "Name",
      render: (user: User) => (
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
            {user.firstName.charAt(0)}
            {user.lastName.charAt(0)}
          </div>
          <span className="font-medium">
            {user.firstName} {user.lastName}
          </span>
        </div>
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
      header: "Role",
      render: (user: User) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            roleColors[user.role.name as keyof typeof roleColors] ||
            "bg-gray-100 text-gray-800"
          }`}
        >
          {user.role.name}
        </span>
      ),
    },
    {
      header: "Shop",
      accessor: (user: User) => user.shop?.name || "N/A",
    },
  ];

  return (
    <div className="p-6">
      <AdminTable
        title="Users"
        data={users}
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

export default AdminUsersPage;
