import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import PageLoading from "./PageLoading";
import { beginApiRequest, resetApiActivity } from "@/services/apiActivity";
import i18n from "@/libs/i18n";

/**
 * The demo API is a Render free-tier service: it sleeps after ~15 minutes idle
 * and takes ~50 seconds to wake. These tests pin the two halves of the deal —
 * that a healthy load looks exactly as it always did, and that a cold start
 * gets an honest explanation rather than a spinner that reads as "broken".
 *
 * The negative case matters more than the positive one: a wake-up message that
 * flashes on every fast page load would make a working site look unreliable,
 * which is the opposite of the point.
 */

beforeEach(() => {
  resetApiActivity();
  vi.useFakeTimers();
});

afterEach(async () => {
  vi.useRealTimers();
  resetApiActivity();
  await i18n.changeLanguage("en");
});

/** Advances both the clock and React's effects together. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("PageLoading", () => {
  it("shows only the ordinary spinner and label at first", () => {
    beginApiRequest();
    render(<PageLoading label="Loading menu..." />);

    expect(screen.getByText("Loading menu...")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("never mentions the server for a fast response", () => {
    const end = beginApiRequest();
    render(<PageLoading label="Loading menu..." />);

    // A healthy API answers in a few hundred milliseconds.
    advance(400);
    act(() => {
      end();
    });

    // Well past the threshold, with nothing in flight — the notice must not
    // appear just because time has passed since the page mounted.
    advance(10_000);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("explains the cold start once a request outlives the threshold", () => {
    beginApiRequest();
    render(<PageLoading label="Loading menu..." />);

    advance(3000);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(/Waking the server up/i);
    // The three things a visitor needs: why, how long, and that it is a one-off.
    expect(notice).toHaveTextContent(/free hosting/i);
    expect(notice).toHaveTextContent(/up to a minute/i);
    expect(notice).toHaveTextContent(/first visit/i);
    // Alive rather than hung.
    expect(notice).toHaveTextContent(/3s of about 60s/);
  });

  it("keeps counting while the request stays outstanding", () => {
    beginApiRequest();
    render(<PageLoading />);

    advance(3000);
    expect(screen.getByRole("status")).toHaveTextContent(/3s of about 60s/);

    advance(9000);
    expect(screen.getByRole("status")).toHaveTextContent(/12s of about 60s/);
  });

  it("goes back to nothing when the request finally lands", () => {
    const end = beginApiRequest();
    render(<PageLoading label="Loading menu..." />);

    advance(5000);
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      end();
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Loading menu...")).toBeInTheDocument();
  });

  it("renders the explanation in Arabic, right-to-left", async () => {
    await act(async () => {
      await i18n.changeLanguage("ar");
    });

    beginApiRequest();
    render(<PageLoading />);
    advance(3000);

    const notice = screen.getByRole("status");
    // Half this app's users read Arabic; an English-only apology explains
    // nothing to them.
    expect(notice).toHaveAttribute("dir", "rtl");
    expect(notice).toHaveTextContent(/جارٍ إيقاظ الخادم/);
    expect(notice).toHaveTextContent(/استضافة مجانية/);
  });
});
