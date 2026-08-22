import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

// axiosInint.ts also wires up axiosInstance's request/response interceptors
// as a module side effect; that's fine to let happen here since we only
// exercise refreshAccessToken() directly and never send a real request
// through axiosInstance.
import {
  clearAccessToken,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
} from "./axiosInint";
import { getApiActivitySnapshot, resetApiActivity } from "./apiActivity";

vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      post: vi.fn(),
      create: actual.default.create,
    },
  };
});

const mockedPost = axios.post as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearAccessToken();
  mockedPost.mockReset();
  resetApiActivity();
});

describe("access token storage", () => {
  // The whole point of the design: the token must never be persisted where
  // an XSS payload (or anything else) could read it back later.
  it("keeps the access token in memory and never writes it to localStorage", () => {
    setAccessToken("an-access-token");

    expect(getAccessToken()).toBe("an-access-token");
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("clearAccessToken drops the in-memory token", () => {
    setAccessToken("an-access-token");
    clearAccessToken();

    expect(getAccessToken()).toBeNull();
  });
});

describe("refreshAccessToken", () => {
  it("dedupes concurrent calls into a single axios.post request and stores the new access token", async () => {
    setAccessToken("old-access-token");

    let resolvePost: (value: unknown) => void;
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });
    mockedPost.mockReturnValue(postPromise);

    const call1 = refreshAccessToken();
    const call2 = refreshAccessToken();

    resolvePost!({
      data: {
        data: {
          accessToken: "new-access-token",
        },
      },
    });

    const [result1, result2] = await Promise.all([call1, call2]);

    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(result1).toBe("new-access-token");
    expect(result2).toBe("new-access-token");
    expect(getAccessToken()).toBe("new-access-token");
  });

  it("sends no token in the body and opts into credentials so the httpOnly cookie rides along", async () => {
    mockedPost.mockResolvedValue({
      data: { data: { accessToken: "new-access-token" } },
    });

    await refreshAccessToken();

    const [url, body, config] = mockedPost.mock.calls[0];
    expect(url).toContain("/auth/refresh");
    expect(body).toEqual({});
    expect(config).toMatchObject({ withCredentials: true });
  });

  it("clears the in-memory token and resolves to null when the refresh request fails", async () => {
    setAccessToken("old-access-token");

    mockedPost.mockRejectedValue(new Error("network error"));

    const result = await refreshAccessToken();

    expect(result).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it("attempts a refresh even with no token in memory (the cookie is invisible to JS)", async () => {
    mockedPost.mockResolvedValue({
      data: { data: { accessToken: "new-access-token" } },
    });

    const result = await refreshAccessToken();

    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(result).toBe("new-access-token");
  });

  /**
   * The silent refresh is a bare axios call, so it bypasses the interceptors
   * that track everything else — and on a hard reload it is the *first*
   * request any returning visitor makes, so it is the one that discovers a
   * sleeping Render service. If it were not tracked by hand, the cold-start
   * notice would stay invisible for the whole boot.
   */
  it("counts as in-flight API activity while it is pending", async () => {
    let resolvePost: (value: unknown) => void = () => {};
    mockedPost.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );

    const pending = refreshAccessToken();
    expect(getApiActivitySnapshot().pending).toBe(1);

    resolvePost({ data: { data: { accessToken: "new-access-token" } } });
    await pending;

    expect(getApiActivitySnapshot()).toEqual({
      pending: 0,
      oldestStartedAt: null,
    });
  });

  it("stops counting as in-flight even when the refresh fails", async () => {
    mockedPost.mockRejectedValue(new Error("network error"));

    await refreshAccessToken();

    // A leaked entry here would leave the wake-up notice on screen forever.
    expect(getApiActivitySnapshot().pending).toBe(0);
  });

  it("starts a fresh request once the previous one has settled", async () => {
    mockedPost.mockResolvedValue({
      data: { data: { accessToken: "new-access-token" } },
    });

    await refreshAccessToken();
    await refreshAccessToken();

    expect(mockedPost).toHaveBeenCalledTimes(2);
  });
});
