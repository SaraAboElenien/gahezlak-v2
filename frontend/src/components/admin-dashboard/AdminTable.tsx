import React, { useState } from "react";
import Loader from "../Loader";
export type Column<T> =
  | {
      header: string;
      accessor: keyof T;
      render?: never;
      className?: string;
    }
  | {
      header: string;
      accessor: (item: T) => string;
      render?: never;
      className?: string;
    }
  | {
      header: string;
      render: (item: T) => React.ReactNode;
      accessor?: never;
      className?: string;
    };

interface AdminTableProps<T> {
  data: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  isSearching?: boolean;
  error?: string;
  title: string;
  currentPage: number;
  totalCount: number;
  limit: number;
  searchValue?: string;
  onPageChange: (newPage: number) => void;
  onSearchChange: (search: string) => void;
}

export function AdminTable<T>({
  data,
  columns,
  isLoading,
  isSearching,
  error,
  title,
  currentPage,
  totalCount,
  limit,
  searchValue: externalSearchValue,
  onPageChange,
  onSearchChange,
}: AdminTableProps<T>) {
  const [searchValue, setSearchValue] = useState(externalSearchValue || "");

  const totalPages = Math.ceil(totalCount / limit);

  if (isLoading)
    return (
      <div className="p-8">
        <Loader />
      </div>
    );
  if (error) return <div className="p-8 text-red-600">{error}</div>;

  return (
    <div className="card-background dark:bg-card rounded-xl shadow-md overflow-hidden border border-gray-100 dark:border-gray-700 py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {totalCount ?? 0} items
          </p>
        </div>

        {/* Search */}
        <div className="mt-3 sm:mt-0 w-full sm:w-64 relative">
          <input
            type="text"
            placeholder="Search..."
            className={`w-full pl-3 pr-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm transition-colors ${
              isSearching
                ? "border-primary bg-primary/5"
                : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
            }`}
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value);
              onSearchChange(e.target.value);
            }}
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {data.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {columns.map((col, index) => (
                  <th
                    key={index}
                    className={`px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${
                      col.className || ""
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-card divide-y divide-gray-200 dark:divide-gray-700">
              {data.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((col, colIndex) => (
                    <td
                      key={colIndex}
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300"
                    >
                      {col.render
                        ? col.render(row)
                        : typeof col.accessor === "function"
                          ? col.accessor(row)
                          : String(
                              (row as Record<string, unknown>)[
                                col.accessor as string
                              ] || "",
                            )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No data found
          </div>
        )}
      </div>

      {/* Pagination - Only show if there are multiple pages and data exists */}
      {totalPages > 1 && data.length > 0 && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">
          <span>
            Page <span className="text-primary">{currentPage}</span> of{" "}
            {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="px-3 py-1 rounded-3xl border bg-white dark:bg-gray-800 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              Previous
            </button>
            <button
              disabled={currentPage === totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              className="px-3 py-1 rounded-3xl border bg-primary text-white dark:bg-gray-800 disabled:opacity-50 hover:bg-darker-primary dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
