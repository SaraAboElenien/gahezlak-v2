import { useState, useCallback, useEffect } from "react";
import { AdminTable } from "@/components/admin-dashboard/AdminTable";
import type { Column } from "@/components/admin-dashboard/AdminTable";
import { useAdminSubscriptions } from "@/hooks/useAdminData";

interface Subscription {
  _id: string;
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
  };
  shop: {
    _id: string;
    name: string;
    email: string;
    phoneNumber: string;
    address: {
      country: string;
      city: string;
      street: string;
    };
  };
  plan: {
    _id: string;
    planGroup: string;
    title: string;
    description: string;
    frequency: string;
    currency: string;
    price: number;
  };
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  isTrialUsed: boolean;
  createdAt: string;
  updatedAt: string;
}

const AdminSubscriptionsPage = () => {
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
  const { data, isLoading, error, isFetching } = useAdminSubscriptions(
    page,
    limit,
    debouncedSearch,
  );

  // Extract data from API response
  const subscriptions = data?.data || [];
  const totalCount = data?.total || 0;

  // Format date function
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const statusColors = {
    active: "bg-green-100 text-green-800",
    trialing: "bg-blue-100 text-blue-800",
    cancelled: "bg-red-100 text-red-800",
    pending: "bg-yellow-100 text-yellow-800",
    expired: "bg-red-100 text-red-800",
  } as const;

  const columns: Column<Subscription>[] = [
    {
      header: "User",
      render: (subscription: Subscription) => (
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
            {subscription.user.firstName.charAt(0)}
            {subscription.user.lastName.charAt(0)}
          </div>
          <div>
            <div className="font-medium text-gray-900 dark:text-white">
              {subscription.user.firstName} {subscription.user.lastName}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {subscription.user.email}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: "Phone",
      accessor: (subscription: Subscription) => subscription.user.phoneNumber,
    },
    {
      header: "Shop",
      render: (subscription: Subscription) => (
        <div>
          <div className="font-medium text-gray-900 dark:text-white">
            {subscription.shop.name}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {subscription.shop.email}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {subscription.shop.phoneNumber}
          </div>
        </div>
      ),
    },
    {
      header: "Plan",
      accessor: (subscription: Subscription) => subscription.plan.title,
    },
    {
      header: "Status",
      render: (subscription: Subscription) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            statusColors[subscription.status as keyof typeof statusColors] ||
            "bg-gray-100 text-gray-800"
          }`}
        >
          {subscription.status}
        </span>
      ),
    },
    {
      header: "Period",
      render: (subscription: Subscription) => (
        <div className="text-sm">
          <div className="text-gray-900 dark:text-white">
            {formatDate(subscription.currentPeriodStart)}
          </div>
          <div className="text-gray-500 dark:text-gray-400">
            to {formatDate(subscription.currentPeriodEnd)}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6">
      <AdminTable
        title="Subscriptions"
        data={subscriptions}
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

export default AdminSubscriptionsPage;
