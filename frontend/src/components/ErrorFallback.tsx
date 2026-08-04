// Top-level crash screen, rendered by the Sentry ErrorBoundary in main.tsx
// when a render-time error escapes every route/component boundary. Kept
// deliberately dependency-free (no i18n/context) since whatever crashed the
// tree might have been one of those providers.
export default function ErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
        <p className="text-gray-600 mb-6">
          An unexpected error occurred. Please try reloading the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="btn btn-gradient border-0 text-white px-6"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
