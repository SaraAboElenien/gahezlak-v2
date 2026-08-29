import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import PricingSection from "./PricingSection";
import type { PricingPlan } from "@/services/plansApi";

/**
 * The landing page advertises exactly one price, and that price is the offer
 * a restaurant owner accepts on the subscription form. Two ways of getting it
 * wrong have already been in production:
 *
 * 1. Both call sites hardcoded a plan ObjectId (`688399b2…`) that belonged to
 *    an older database. Every landing-page view fired a guaranteed-404
 *    `GET /plans/688399b2…`, waited for it, then fired a second request to
 *    recover — doubling the section's time to render on the free tier's cold
 *    start and burying real 404s in the production log.
 * 2. The hook that "recovered" substituted `getActivePlans()[0]`, so the price
 *    on the page was not a chosen plan at all — it was whatever happened to
 *    sort first, and would have changed silently the next time an admin added
 *    or reordered a plan.
 *
 * These tests pin both: the request that cannot succeed is not made, and the
 * plan on screen is the deliberately chosen one rather than an array accident.
 * The mock boundary is the axios instance rather than the hook, because "no
 * request is made for a nonexistent id" is a claim about HTTP.
 */

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("@/services/axiosInint", () => ({
  axiosInstance: { get: getMock },
}));

/**
 * The section's reveal animations use framer-motion's `whileInView`, which
 * observes the viewport — and jsdom has no IntersectionObserver, so mounting
 * throws without this. The stub reports the element as visible immediately, so
 * the markup under test settles into its final state. Stubbed per-file rather
 * than in `src/tests/setup.ts`: only components with viewport animations need
 * it, and a global fake viewport is not something the other suites asked for.
 */
beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds: readonly number[] = [];

      // Declared and assigned separately rather than as a constructor
      // parameter property: this project builds with `erasableSyntaxOnly`,
      // which forbids the shorthand.
      private readonly callback: IntersectionObserverCallback;

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
      }

      observe(target: Element) {
        this.callback(
          [{ target, isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }

      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    },
  );
});

function plan(overrides: Partial<PricingPlan>): PricingPlan {
  return {
    _id: "id",
    planGroup: "Starter",
    title: "Starter",
    description: "description",
    frequency: "monthly",
    currency: "EGP",
    price: 0,
    features: [],
    trialPeriodDays: 7,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    __v: 0,
    ...overrides,
  };
}

/**
 * Deliberately ordered so that neither the advertised plan nor its group comes
 * first: picking `[0]`, or the first entry merely matching the group, both
 * yield the wrong price here. Mirrors the four plans that actually exist in
 * production.
 */
const PRODUCTION_SHAPED_PLANS: PricingPlan[] = [
  plan({
    _id: "pro-monthly",
    planGroup: "Pro",
    title: "Pro monthly",
    frequency: "monthly",
    price: 799,
  }),
  plan({
    _id: "starter-yearly",
    planGroup: "Starter",
    title: "Starter yearly",
    frequency: "yearly",
    price: 2990,
  }),
  plan({
    _id: "starter-monthly",
    planGroup: "Starter",
    title: "Starter monthly",
    description: "Everything a single restaurant needs to get started.",
    frequency: "monthly",
    price: 299,
    features: ["QR menus", "Online ordering"],
    trialPeriodDays: 7,
  }),
  plan({
    _id: "pro-yearly",
    planGroup: "Pro",
    title: "Pro yearly",
    frequency: "yearly",
    price: 7990,
  }),
];

/**
 * Answers `/plans` with `plans` and rejects anything else. Modelling the
 * by-id route as a failure is what production actually does — the id the two
 * call sites used to hardcode belonged to an older database and 404s — so a
 * regression to fetching a plan by id shows up here as a failure rather than
 * being quietly answered by the mock.
 */
function respondWithPlans(plans: PricingPlan[]) {
  getMock.mockImplementation((url: string) =>
    url === "/plans"
      ? Promise.resolve({ data: { data: plans } })
      : Promise.reject(new Error(`unexpected request: GET ${url}`)),
  );
}

function renderPricingSection() {
  const queryClient = new QueryClient({
    // No retries: a failing query should surface as an error immediately
    // rather than being retried past the test's timeout.
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PricingSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PricingSection plan selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    respondWithPlans(PRODUCTION_SHAPED_PLANS);
  });

  it("shows the entry-level monthly plan, not whichever plan sorts first", async () => {
    renderPricingSection();

    // The Starter monthly price, from the third entry in the response.
    expect(await screen.findByText("299")).toBeInTheDocument();
    expect(
      screen.getByText("Everything a single restaurant needs to get started."),
    ).toBeInTheDocument();

    // The prices that would appear if selection were positional (799, the
    // first entry) or group-only (2990, the first Starter entry).
    expect(screen.queryByText("799")).not.toBeInTheDocument();
    expect(screen.queryByText("2990")).not.toBeInTheDocument();
  });

  it("never requests a plan by id", async () => {
    renderPricingSection();

    await screen.findByText("299");

    // Every call must be the plans listing. A `/plans/<id>` request is either
    // a hardcoded id (which 404s against any other database) or a needless
    // second round trip on a cold start.
    expect(getMock).toHaveBeenCalled();
    for (const [url] of getMock.mock.calls) {
      expect(url).toBe("/plans");
    }
  });

  it("says no plans are available rather than advertising a different plan's price", async () => {
    // The advertised group is absent — the state that used to be papered over
    // by silently falling back to the first active plan, which is how a wrong
    // price reaches a customer without anything looking broken.
    respondWithPlans([
      plan({ _id: "pro-monthly", planGroup: "Pro", price: 799 }),
      plan({ _id: "pro-yearly", planGroup: "Pro", price: 7990 }),
    ]);

    renderPricingSection();

    expect(
      await screen.findByText("No pricing plans available at the moment."),
    ).toBeInTheDocument();
    expect(screen.queryByText("799")).not.toBeInTheDocument();
  });

  it("ignores inactive plans", async () => {
    respondWithPlans([
      plan({ _id: "starter-monthly-retired", price: 199, isActive: false }),
      plan({ _id: "starter-monthly", price: 299 }),
    ]);

    renderPricingSection();

    // A retired plan left in the collection must not become the advertised
    // price just because it comes first.
    expect(await screen.findByText("299")).toBeInTheDocument();
    expect(screen.queryByText("199")).not.toBeInTheDocument();
  });

  it("shows the error state when the plans request fails", async () => {
    getMock.mockRejectedValue(new Error("network down"));

    renderPricingSection();

    await waitFor(() => {
      expect(
        screen.getByText(
          "Failed to load pricing plans. Please try again later.",
        ),
      ).toBeInTheDocument();
    });
  });
});
