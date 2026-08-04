import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import toast from "react-hot-toast";
import Register from "./Register";
import { useRegister } from "@/hooks/useAuth";

// Uses the app's real i18next instance (initialized in src/tests/setup.ts)
// so translated labels/messages render exactly as they do in the app.

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useRegister: vi.fn(),
}));

const mockedUseRegister = vi.mocked(useRegister);
const mockedToastError = vi.mocked(toast.error);
const mockedToastSuccess = vi.mocked(toast.success);

async function fillValidFormAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.type(screen.getByLabelText("First Name"), "Test Bistro");
  await user.type(screen.getByLabelText("Last Name"), "Owner Name");
  await user.type(screen.getByLabelText("Email"), "owner@example.com");
  await user.type(screen.getByLabelText("Phone Number"), "01012345678");
  await user.type(screen.getByLabelText("Password"), "StrongPass1!");
  await user.type(screen.getByLabelText("Confirm Password"), "StrongPass1!");
  await user.click(screen.getByRole("checkbox"));

  await user.click(screen.getByRole("button", { name: /register/i }));
}

describe("Register - network error regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a generic error toast (no 'undefined') and does not throw when the register request fails with a network-level error that has no err.response", async () => {
    // Shaped like a real axios network error (e.g. backend unreachable):
    // err.response is undefined entirely, not just err.response.data.
    const mutate = vi.fn(
      (_data: unknown, handlers: { onError: (err: unknown) => void }) => {
        handlers.onError({
          code: "ERR_NETWORK",
          request: {},
          response: undefined,
        });
      },
    );
    mockedUseRegister.mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useRegister>);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>,
    );

    await expect(fillValidFormAndSubmit(user)).resolves.not.toThrow();

    await waitFor(() => {
      expect(mutate).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockedToastError).toHaveBeenCalled();
    });

    const [message] = mockedToastError.mock.calls[0];
    expect(message).not.toContain("undefined");
    expect(message).toBe(
      "Register failed An error occurred. Please try again..",
    );
    expect(mockedToastSuccess).not.toHaveBeenCalled();
  });

  it("still shows a real backend message when err.response.data.message is present", async () => {
    const mutate = vi.fn(
      (_data: unknown, handlers: { onError: (err: unknown) => void }) => {
        handlers.onError({
          response: { data: { message: "Email already in use" } },
        });
      },
    );
    mockedUseRegister.mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useRegister>);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>,
    );

    await fillValidFormAndSubmit(user);

    await waitFor(() => {
      expect(mockedToastError).toHaveBeenCalledWith(
        "Register failed Email already in use.",
      );
    });
  });
});

// Sanity check that fireEvent.submit path (no user typing) doesn't crash the
// handler wiring either — react-hook-form validation will simply block
// submission on an empty form, so mutate should never be invoked.
describe("Register - empty form submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call mutate when the form is submitted empty", async () => {
    const mutate = vi.fn();
    mockedUseRegister.mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useRegister>);

    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>,
    );

    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        screen.getByText(/restaurant name is required/i),
      ).toBeInTheDocument();
    });
    expect(mutate).not.toHaveBeenCalled();
  });
});
