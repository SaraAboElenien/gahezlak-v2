import { X } from "lucide-react";

interface FilterSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  sort: string;
  onSortChange: (value: string) => void;
  categories: string[];
}

export default function FilterSidebar({
  isOpen,
  onClose,
  search,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  sort,
  onSortChange,
  categories,
}: FilterSidebarProps) {
  const handleReset = () => {
    onSearchChange("");
    onCategoryChange("all");
    onSortChange("default");
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-80 bg-white shadow-xl transform transition-transform duration-300 z-50 font-cairo ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-neutral">Filters</h2>
            <button className="btn btn-ghost btn-circle" onClick={onClose}>
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {/* Search */}
          <div>
            <label className="label">
              <span className="label-text">Search</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search for meal ..."
            />
          </div>

          {/* Category */}
          <div>
            <label className="label">
              <span className="label-text">Category</span>
            </label>
            <select
              className="select select-bordered w-full"
              value={selectedCategory}
              onChange={(e) => onCategoryChange(e.target.value)}
            >
              <option value="all">All</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="label">
              <span className="label-text">Sort By</span>
            </label>
            <select
              className="select select-bordered w-full"
              value={sort}
              onChange={(e) => onSortChange(e.target.value)}
            >
              <option value="default">Default</option>
              <option value="name-asc">Name(A-z)</option>
              <option value="price-low">Price: Low to High </option>
              <option value="price-high">Price: High to Low</option>
              <option value="popular">Top rated</option>
            </select>
          </div>
        </div>

        <div className="absolute bottom-4 left-4 right-4 space-y-2">
          <button onClick={handleReset} className="btn btn-outline w-full">
            Reset
          </button>
        </div>
      </div>
    </>
  );
}
