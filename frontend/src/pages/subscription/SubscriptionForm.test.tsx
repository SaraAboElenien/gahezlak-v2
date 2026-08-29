import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SubscriptionForm from "./SubscriptionForm";
import { useCreateSubscription } from "@/hooks/useSubscriptions";
import { useProfile } from "@/hooks/useProfile";
import type { PricingPlan } from "@/services/plansApi";

/**
 * This form is the acceptance of the offer the landing page makes, so the plan
 * it charges for has to be the same plan the pricing card advertised — and the
 * id it sends to Paymob has to be a real one. Both call sites previously named
 * the plan by a hardcoded ObjectId from an older database, which 404'd and then
 * silently fell back to `getActivePlans()[0]`; the customer could therefore have
 * been billed for a plan whose price they were never shown.
 */

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("@/services/axiosInint", () => ({
  axiosInstance: { get: getMock },
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/useSubscriptions", () => ({
  useCreateSubscription: vi.fn(),
}));

vi.mock("@/hooks/useProfile", () => ({
  useProfile: vi.fn(),
}));

const mockedUseCreateSubscription = vi.mocked(useCreateSubscription);
const mockedUseProfile = vi.mocked(useProfile);

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

// Same ordering trap as the pricing-section test: the advertised plan is
// neither first overall nor first within its group.
const PRODUCTION_SHAPED_PLANS: PricingPlan[] = [
  plan({ _id: "pro-monthly", planGroup: "Pro", price: 799 }),
  plan({ _id: "starter-yearly", frequency: "yearly", price: 2990 }),
  plan({ _id: "starter-monthly", title: "Starter monthly", price: 299 }),
];

/**
 * Answers `/plans` and rejects anything else, because that is what production
 * does with a by-id lookup for the id these call sites used to hardcode: it
 * belongs to an older database and 404s.
 */
function respondWithPlans(plans: PricingPlan[]) {
  getMock.mockImplementation((url: string) =>
    url === "/plans"
      ? Promise.resolve({ data: { data: plans } })
      : Promise.reject(new Error(`unexpected request: GET ${url}`)),
  );
}

function renderSubscriptionForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SubscriptionForm />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SubscriptionForm plan selection", () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    respondWithPlans(PRODUCTION_SHAPED_PLANS);

    // No iframeUrl, so the success path stops at a toast instead of assigning
    // window.location.href — the assertion here is about what was sent, not
    // about the redirect.
    mutateAsync.mockResolvedValue({ data: {}, message: "no url" });
    mockedUseCreateSubscription.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateSubscription>);

    mockedUseProfile.mockReturnValue({
      user: { _id: "user-1", shop: { _id: "shop-1" } },
      loading: false,
      handleLogout: vi.fn(),
    } as unknown as ReturnType<typeof useProfile>);
  });

  it("charges for the advertised entry-level monthly plan", async () => {
    renderSubscriptionForm();

    // Headline price, line item and total all restate it.
    expect(await screen.findAllByText("EGP 299.00")).toHaveLength(3);
    expect(screen.getByText("Starter monthly")).toBeInTheDocument();
    expect(screen.queryByText("EGP 799.00")).not.toBeInTheDocument();
    expect(screen.queryByText("EGP 2990.00")).not.toBeInTheDocument();
  });

  it("subscribes with the advertised plan's real id, not the first plan in the list", async () => {
    const user = userEvent.setup();
    renderSubscriptionForm();

    await screen.findAllByText("EGP 299.00");
    await user.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(mutateAsync).toHaveBeenCalledWith("starter-monthly");
  });

  it("never requests a plan by id", async () => {
    renderSubscriptionForm();

    await screen.findAllByText("EGP 299.00");

    expect(getMock).toHaveBeenCalled();
    for (const [url] of getMock.mock.calls) {
      expect(url).toBe("/plans");
    }
  });
});
