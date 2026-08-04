export const SkeletonCard = () => (
  <div className="card w-full shadow-md animate-pulse">
    <div className="card-body">
      <div className="h-6 w-1/3 bg-base-300 rounded mb-2"></div>
      <div className="h-10 w-1/2 bg-base-200 rounded mb-1"></div>
      <div className="h-4 w-2/3 bg-base-300 rounded"></div>
    </div>
  </div>
);

export const SkeletonChart = () => (
  <div className="card w-full shadow-md animate-pulse">
    <div className="card-body">
      <div className="h-6 w-1/4 bg-base-300 rounded mb-4"></div>
      <div className="h-64 bg-base-200 rounded"></div>
    </div>
  </div>
);

export const SkeletonTable = () => (
  <div className="card w-full shadow-md animate-pulse">
    <div className="card-body">
      <div className="h-6 w-1/4 bg-base-300 rounded mb-4"></div>
      <div className="h-48 bg-base-200 rounded"></div>
    </div>
  </div>
);
