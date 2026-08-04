import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  ChartLine,
  TrendingUp,
  ShoppingBag,
  TrendingDown,
  Activity,
} from "lucide-react";
import {
  useRevenueGrowth,
  useTopRestaurants,
  useAdminTotalRevenue,
} from "@/hooks/useAdminAnalytics";
import { useState } from "react";
import { DatePicker } from "@/components/analytics/PeriodFilter";
import { formatDateYMD } from "@/utils/getDateRange";
import { MonthSelector } from "@/components/analytics/MonthPicker";

const now = new Date();

// Get the first day of last month
const getStartOfLastMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

// Get the last day of last month
const getEndOfLastMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0);
};

// Helper: get start and end date for a given month
const getMonthRange = (year: number, month: number) => {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { start, end };
};

const AdminAnalytics = () => {
  // State for top restaurnt date range
  const [customStartDate, setCustomStartDate] = useState<Date>();
  const [customEndDate, setCustomEndDate] = useState<Date>();
  const startDate =
    formatDateYMD(customStartDate) || formatDateYMD(getStartOfLastMonth());
  const endDate =
    formatDateYMD(customEndDate) || formatDateYMD(getEndOfLastMonth());

  // State for revenue date range
  const [revenuDate, setRevenuStartDate] = useState<Date>();
  const [revenuEndDate, setRevenuDateEndDate] = useState<Date>();
  const revenuStartDate =
    formatDateYMD(revenuDate) || formatDateYMD(getStartOfLastMonth());
  const revenuEndDatee =
    formatDateYMD(revenuEndDate) || formatDateYMD(getEndOfLastMonth());

  // state for month range picker for growth rate
  const defaultMonth2 = { month: now.getMonth() + 1, year: now.getFullYear() };
  const defaultMonth1 =
    defaultMonth2.month === 1
      ? { month: 12, year: defaultMonth2.year - 1 }
      : { month: defaultMonth2.month - 1, year: defaultMonth2.year };

  const [month1, setMonth1] = useState(defaultMonth1); // comparison
  const [month2, setMonth2] = useState(defaultMonth2); // current

  const range1 = getMonthRange(month1.year, month1.month);
  const range2 = getMonthRange(month2.year, month2.month);

  const topRestaurantsParams = {
    limit: 10,
    startDate: startDate,
    endDate: endDate,
  };

  const revenueGrowthParams = {
    start1: range1.start,
    end1: range1.end,
    start2: range2.start,
    end2: range2.end,
  };

  const totalRevenueParams = {
    startDate: revenuStartDate,
    endDate: revenuEndDatee,
  };

  const { data: topRestaurantsData } = useTopRestaurants(topRestaurantsParams);
  console.log("topRestaurantsData:", topRestaurantsData);
  const { data: revenueGrowthData } = useRevenueGrowth(revenueGrowthParams);
  console.log("revenueGrowthData:", revenueGrowthData);
  const { data: totalRevenueData } = useAdminTotalRevenue(totalRevenueParams);
  console.log("totalRevenueData:", totalRevenueData);

  const barData =
    topRestaurantsData?.data.map((r) => ({
      name: r.shopName || "Unnamed",
      orders: r.totalShopRevenue || 0,
    })) || [];

  const percentage = Number(revenueGrowthData?.data.percentageChange) || 0;

  const isPositive = percentage > 0;
  const isNegative = percentage < 0;

  const textColor = isPositive
    ? "text-green-600"
    : isNegative
      ? "text-red-600"
      : "text-yellow-500";

  const label = isPositive
    ? `Revenue increased by ${percentage}%`
    : isNegative
      ? `Revenue decreased by ${Math.abs(percentage)}%`
      : `Revenue remained the same`;

  return (
    <>
      <div className="min-h-screen bg-base-200 p-4">
        <div className="bg-white dark:bg-card shadow-sm border-b border-gray-200 dark:border-gray-700 rounded-md ">
          <div className="mx-auto px-6 py-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-primary to-darker-primary rounded-2xl flex items-center justify-center shadow">
                  <ChartLine className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                    Shops Analytics
                  </h1>
                  <p className="text-lg text-gray-600 dark:text-gray-300">
                    Overview of your shops performance
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-5 items-center mt-6">
              {/* Total Orders Card */}
              <div className="card bg-gray-50 shadow w-full lg:w-1/2 min-h-[250px]">
                <div className="card-body pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="card-title text-sm font-medium text-base-content/70">
                        Total Revenue
                      </h2>
                      <p className="text-3xl font-bold  text-primary">
                        EGP
                        {totalRevenueData?.data.totalRevenue.toFixed(2) ||
                          "0.00"}
                      </p>
                      <p className="text-sm text-base-content/60">
                        From {totalRevenueParams.startDate} to{" "}
                        {totalRevenueParams.endDate}
                      </p>
                    </div>
                    <div className="p-3 bg-primary/20 rounded-full">
                      <ShoppingBag className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                </div>
                <div className=" w-full  p-3 pb-0">
                  <h4 className="card-title mb-1 text-sm font-medium text-base-content/70 ">
                    Select Period
                  </h4>
                  <DatePicker
                    customStartDate={revenuDate}
                    setCustomStartDate={setRevenuStartDate}
                    customEndDate={revenuEndDate}
                    setCustomEndDate={setRevenuDateEndDate}
                  />
                </div>
              </div>

              <div className="card bg-gray-50 shadow w-full lg:w-1/2 min-h-[250px]">
                <div className="card-body pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="card-title text-sm font-medium text-base-content/70">
                        Revenue Growth Rate
                      </h2>
                      <p className="text-3xl font-bold text-primary">
                        {percentage}%
                      </p>
                      <p className={`mt-2 text-sm font-medium ${textColor}`}>
                        {label}
                      </p>
                    </div>

                    <div className="p-3">
                      <div className="flex items-center gap-2">
                        <div className={`text-2xl font-semibold ${textColor}`}>
                          {isPositive ? (
                            <TrendingUp className="w-8 h-8 inline-block mr-1 animate-bounce" />
                          ) : isNegative ? (
                            <TrendingDown className="w-8 h-8 inline-block mr-1 animate-bounce" />
                          ) : (
                            <Activity className="w-8 h-8 inline-block mr-1 animate-pulse" />
                          )}
                          {percentage}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="filterMonth p-2 px-4 flex flex-col gap-2">
                  <h4 className="card-title mb-1 text-sm font-medium text-base-content/70 ">
                    Select a Range
                  </h4>

                  <MonthSelector
                    selectedMonth={month1}
                    setSelectedMonth={setMonth1}
                    label=" From"
                  />
                  <MonthSelector
                    selectedMonth={month2}
                    setSelectedMonth={setMonth2}
                    label=" To"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1  gap-6 mt-10 bg-gray-50 p-6 rounded-lg shadow">
              <div className="flex gap-4 w-full  p-3 pb-0">
                <DatePicker
                  customStartDate={customStartDate}
                  setCustomStartDate={setCustomStartDate}
                  customEndDate={customEndDate}
                  setCustomEndDate={setCustomEndDate}
                />
              </div>
              <div className="card bg-white p-6">
                <h2 className="text-xl font-semibold mb-4">Top Restaurants</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar
                      dataKey="orders"
                      fill="#10B981"
                      radius={[10, 10, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminAnalytics;
