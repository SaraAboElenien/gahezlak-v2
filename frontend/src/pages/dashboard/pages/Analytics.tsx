import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  ShoppingBag,
  AlertTriangle,
  ChartLine,
  Coins,
} from "lucide-react";
import {
  useBestWorstSellers,
  useCancellationRate,
  useOrderCounts,
  useSalesComparisonRange,
  useTotalRevenue,
} from "@/hooks/useAnalytics";
import {
  SkeletonCard,
  SkeletonChart,
  SkeletonTable,
} from "@/components/analytics/SkeletonLoaders";
import PeriodSelector, {
  DatePicker,
} from "@/components/analytics/PeriodFilter";
import { MonthSelector } from "@/components/analytics/MonthPicker";
import { formatDateYMD } from "@/utils/getDateRange";
import { useLang } from "@/hooks/useLang";
import { useTranslation } from "react-i18next";

// Get the first day of last month
// const getStartOfLastMonth = () => {
//   const now = new Date();
//   return new Date(now.getFullYear(), now.getMonth(), 1);
// };

// Get the last day of last month
// const getEndOfLastMonth = () => {
//   const now = new Date();
//   return new Date(now.getFullYear(), now.getMonth() + 1, 0);
// };

const now = new Date();

// Helper: get start and end date for a given month
const getMonthRange = (year: number, month: number) => {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${endDate.getFullYear()}-${String(
    endDate.getMonth() + 1,
  ).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { start, end };
};

const Analytics = () => {
  const [period, setPeriod] = useState<"daily" | "monthly" | "yearly">("daily");
  const [customStartDate, setCustomStartDate] = useState<Date>();
  const [customEndDate, setCustomEndDate] = useState<Date>();
  const [limitNumber, setLimitNumber] = useState<number>(1);
  const [isError, setIsError] = useState(false);

  const { currentLang } = useLang();
  const { t } = useTranslation();

  const defaultMonth2 = { month: now.getMonth() + 1, year: now.getFullYear() };
  const defaultMonth1 =
    defaultMonth2.month === 1
      ? { month: 12, year: defaultMonth2.year - 1 }
      : { month: defaultMonth2.month - 1, year: defaultMonth2.year };

  const [month1, setMonth1] = useState(defaultMonth1);
  const [month2, setMonth2] = useState(defaultMonth2); // current

  const range1 = getMonthRange(month1.year, month1.month);
  const range2 = getMonthRange(month2.year, month2.month);

  const { data: SalesComparisonRange } = useSalesComparisonRange({
    start1: range1.start,
    end1: range1.end,
    start2: range2.start,
    end2: range2.end,
  });

  const { data: totalRevenueData, isLoading: isLoadingTotalRevenue } =
    useTotalRevenue();

  const queryParams: { limit: number; startDate?: string; endDate?: string } = {
    limit: limitNumber,
  };

  if (customStartDate) {
    queryParams.startDate = formatDateYMD(customStartDate);
  }

  if (customEndDate) {
    queryParams.endDate = formatDateYMD(customEndDate);
  }

  const { data: BWData, isLoading: isLoadingBW } =
    useBestWorstSellers(queryParams);
  console.log("BWData:", BWData);

  const { data: canceledRate, isLoading: isLoadingCancel } =
    useCancellationRate();
  const { data: OrderCountData, isLoading: isLoadingOrders } =
    useOrderCounts(period);

  const handleLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);

    if (value >= 1 && value <= 100) {
      setLimitNumber(value);
      setIsError(false);
    } else {
      setLimitNumber(value);
      setIsError(true);
    }
  };

  const comparisonData = [
    {
      name: currentLang === "ar" ? " الفترة الأولي" : " First Period",
      total: `${SalesComparisonRange?.data.total1}` || 0,
    },
    {
      name: currentLang === "ar" ? " الفترة الثانية" : " Second Period",
      total: SalesComparisonRange?.data.total2 || 0,
    },
  ];

  // const salesRange = SalesComparisonRange?.data || {
  //   total1: 0,
  //   total2: 0,
  //   percentageChange: 0,
  // };

  const cancellationData = canceledRate?.data || {
    canceledOrders: 0,
    totalOrders: 0,
    cancellationRate: 0,
  };

  const cancellationPieData = [
    {
      name: "Completed",
      value: cancellationData.totalOrders - cancellationData.canceledOrders,
      color: "#22c55e",
    },
    {
      name: "Canceled",
      value: cancellationData.canceledOrders,
      color: "#ef4444",
    },
  ];

  const sellersData = BWData?.data || { bestSellers: [], worstSellers: [] };

  const ordersData = (OrderCountData?.data || []).map((order) => {
    const { day, month, year } = order._id;

    let dateLabel = "";

    if (period === "daily") {
      dateLabel = `${day}/${month}`;
    } else if (period === "monthly") {
      dateLabel = `Month ${month}/${year}`;
    } else if (period === "yearly") {
      dateLabel = `${year}`;
    }

    return {
      date: dateLabel,
      count: order.count,
    };
  });

  return (
    <div className="min-h-screen bg-base-200 p-4">
      {/* Hero Header */}
      <div className="bg-white dark:bg-card shadow-sm border-b border-gray-200 dark:border-gray-700 rounded-md">
        <div className="mx-auto px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Title Section */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-darker-primary rounded-2xl flex items-center justify-center shadow">
                <ChartLine className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                  {t("analyticsTitle")}
                </h1>
                <p className="text-lg text-gray-600 dark:text-gray-300">
                  {t("analyticsSubtitle")}
                </p>
              </div>
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
            {/* Total Revenue Card */}
            {isLoadingTotalRevenue ? (
              <SkeletonCard />
            ) : (
              <div className="card bg-muted shadow">
                <div className="card-body">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="card-title text-sm font-medium text-base-content/70">
                        {t("totalRevenue")}
                      </h2>
                      <p className="text-2xl font-bold text-primary">
                        {totalRevenueData?.data ?? 0} EGP
                      </p>
                    </div>
                    <div className="p-3 bg-primary/20 rounded-full">
                      <Coins className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Total Orders Card */}
            {isLoadingOrders ? (
              <SkeletonCard />
            ) : (
              <div className="card bg-muted shadow">
                <div className="card-body">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="card-title text-sm font-medium text-base-content/70">
                        {t("totalOrders")}
                      </h2>
                      <p className="text-3xl font-bold text-base-content">
                        {cancellationData?.totalOrders ?? 0}
                      </p>
                      <p className="text-sm text-base-content/60">
                        {t("thisMonth")}
                      </p>
                    </div>
                    <div className="p-3 bg-primary/20 rounded-full">
                      <ShoppingBag className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Cancellation Rate Card */}
            {isLoadingCancel ? (
              <SkeletonCard />
            ) : (
              <div className="card bg-muted shadow">
                <div className="card-body">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="card-title text-sm font-medium text-base-content/70">
                        {t("cancellationRate")}
                      </h2>
                      <p className="text-3xl font-bold text-error">
                        {cancellationData?.cancellationRate ?? 0}%
                      </p>
                      <p className="text-sm text-base-content/60">
                        {t("canceledOrders", {
                          count: cancellationData?.canceledOrders ?? 0,
                        })}
                      </p>
                    </div>
                    <div className="p-3 bg-error/20 rounded-full">
                      <AlertTriangle className="w-6 h-6 text-error" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Best Seller Card */}
            {isLoadingBW ? (
              <SkeletonCard />
            ) : (
              <div className="card bg-muted shadow">
                <div className="card-body">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="card-title text-sm font-medium text-base-content/70">
                        {t("topItem")}
                      </h2>
                      <p className="text-xl font-bold text-base-content">
                        {sellersData?.bestSellers?.[0]?.name?.en ?? t("noData")}
                      </p>
                      <p className="text-sm text-success">
                        {t("ordersCount", {
                          count: sellersData?.bestSellers?.[0]?.total ?? 0,
                        })}
                      </p>
                    </div>
                    <div className="p-3 bg-warning/20 rounded-full">
                      <TrendingUp className="w-6 h-6 text-warning" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className=" mt-10 mx-auto ">
        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 ">
          {/* Daily Orders Chart */}
          <div className="card bg-white shadow-md">
            <div className="periodSelectio bg-gray-100 shadow-md">
              <PeriodSelector period={period} setPeriod={setPeriod} />
            </div>

            {isLoadingOrders ? (
              <SkeletonChart />
            ) : (
              <div className="card-body pl-2">
                <h2 className="card-title mb-4">{t("ordersTrend")}</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ordersData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="opacity-30"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        tickLine={{ stroke: "#64748b" }}
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        tickLine={{ stroke: "#64748b" }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--b1))",
                          border: "1px solid hsl(var(--b3))",
                          borderRadius: "8px",
                          color: "hsl(var(--bc))",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#3B82F6"
                        strokeWidth={3}
                        dot={{ fill: "#3B82F6", strokeWidth: 2, r: 6 }}
                        activeDot={{ r: 8, stroke: "#3B82F6", strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
          {/* Sales Comparison Chart */}
          <div className="card bg-white shadow-md">
            <div className="filterMonth p-2 px-4 flex flex-col gap-2">
              <MonthSelector
                selectedMonth={month1}
                setSelectedMonth={setMonth1}
                label={
                  currentLang === "ar" ? " الفترة الأولي" : " First Period"
                }
              />
              <MonthSelector
                selectedMonth={month2}
                setSelectedMonth={setMonth2}
                label={
                  currentLang === "ar" ? " الفترة الثانية" : " Second Period"
                }
              />
            </div>
            {isLoadingCancel ? (
              <SkeletonChart />
            ) : (
              <div className="card-body">
                <h2 className="card-title mb-4">
                  {t("ordersSalesComparison")}
                </h2>
                <div className="h-64 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={comparisonData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar
                        dataKey="total"
                        fill="#3B82F6"
                        radius={[10, 10, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          <div className="card w-full col-span-1 bg-white shadow-md p-4 rounded-md pt-0 flex items-center justify-between gap-3">
            <div className="flex gap-4 w-full bg-white p-3 pb-0">
              <div className="w-3/4">
                <DatePicker
                  period={period}
                  setPeriod={setPeriod}
                  customStartDate={customStartDate}
                  setCustomStartDate={setCustomStartDate}
                  customEndDate={customEndDate}
                  setCustomEndDate={setCustomEndDate}
                />
              </div>
              <div className="w-1/4 ">
                <label className="block mb-1 font-semibold">
                  {t("limit")}{" "}
                </label>
                <input
                  type="number"
                  className="input validator bg-gray-100 border-gray-300 focus:border-primary focus:ring-primary w-full  "
                  required
                  placeholder="Type a number between 1 to 10"
                  value={limitNumber}
                  onChange={(e) => handleLimitChange(e)}
                  min="1"
                  max="100"
                  title="Must be between be 1 to 100"
                />
                {isError && (
                  <p className="text-xs text-red-500 mt-1">{t("errorLimit")}</p>
                )}
              </div>
            </div>

            <h2 className="text-xl font-semibold mb-4 p-2 bg-gray-100">
              {t("salesPerformance")}
            </h2>

            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Best Sellers */}
              <div>
                <h3 className="text-success font-bold text-lg mb-2">
                  {t("bestSellers")}
                </h3>
                {isLoadingBW ? (
                  <SkeletonTable />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table table-zebra">
                      <thead className="p-2 bg-gray-100">
                        <tr>
                          <th>{t("rank")}</th>
                          <th>{t("item")}</th>
                          <th>{t("orders")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sellersData.bestSellers.map((item, index: number) => (
                          <tr key={index}>
                            <td>
                              <div className="w-7 text-center p-2 bg-green-400 rounded">
                                {index + 1}
                              </div>
                            </td>
                            <td>
                              <div>
                                <div className="font-bold">{item.name.en}</div>
                                <div className="text-sm opacity-50">
                                  {item.name.ar}
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="badge p-2 badge-outline">
                                {item.total}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Worst Sellers */}
              <div>
                <h3 className="text-error font-bold text-lg mb-2">
                  {t("worstSellers")}
                </h3>
                {isLoadingBW ? (
                  <SkeletonTable />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table table-zebra">
                      <thead className="p-2 bg-gray-100">
                        <tr>
                          <th>{t("rank")}</th>
                          <th>{t("item")}</th>
                          <th>{t("orders")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sellersData.worstSellers.map((item, index: number) => (
                          <tr key={index}>
                            <td>
                              <div className="w-7 text-center p-2 bg-red-400 rounded">
                                {index + 1}
                              </div>
                            </td>
                            <td>
                              <div>
                                <div className="font-bold">{item.name.en}</div>
                                <div className="text-sm opacity-50">
                                  {item.name.ar}
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="badge p-2 badge-outline">
                                {item.total}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cancellation Rate Pie Chart */}
          <div className="card bg-white shadow-md">
            {isLoadingCancel ? (
              <SkeletonChart />
            ) : (
              <div className="card-body">
                <h2 className="card-title mb-4">
                  {t("orderStatusDistribution")}
                </h2>
                <div className="h-64 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={cancellationPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {cancellationPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--b1))",
                          border: "1px solid hsl(var(--b3))",
                          borderRadius: "8px",
                          color: "hsl(var(--bc))",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-base font-bold">
                      {t("totalOrders")}({cancellationData.totalOrders})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-error rounded-full"></div>
                    <span className="text-base font-bold">
                      {t("canceled")} ({cancellationData.canceledOrders})
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
