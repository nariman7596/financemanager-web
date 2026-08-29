import { describe, it, expect } from "vitest";
import { createApiClient, memoryTokenStore } from "./client";
import { ApiError } from "./types";

/** A fetch stand-in that records calls and replays scripted responses. */
function fakeFetch(handler: (url: string, init: any) => { status: number; body: unknown }) {
  const calls: { url: string; init: any }[] = [];
  const fn = async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const { status, body } = handler(String(url), init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fn: fn as unknown as typeof fetch, calls };
}

describe("token refresh", () => {
  // Without a shared in-flight promise, five concurrent 401s start five
  // rotations. Rotation revokes the previous token, so the server would see
  // four of them as REUSE, revoke the whole family, and the client would sign
  // the user out entirely on its own. This is the single most important
  // behaviour in the client.
  it("refreshes once for many concurrent 401s", async () => {
    let accessValid = false;
    const { fn, calls } = fakeFetch((url) => {
      if (url.endsWith("/auth/refresh")) {
        accessValid = true;
        return { status: 200, body: { accessToken: "new", refreshToken: "new-r" } };
      }
      return accessValid
        ? { status: 200, body: [{ id: "1" }] }
        : { status: 401, body: { message: "expired" } };
    });

    const tokens = memoryTokenStore();
    await tokens.setTokens({ accessToken: "stale", refreshToken: "r" });
    const api = createApiClient({ baseUrl: "http://x/api/v1", tokens, fetch: fn });

    const results = await Promise.all([
      api.accounts.list(), api.accounts.list(), api.accounts.list(),
      api.accounts.list(), api.accounts.list(),
    ]);

    expect(results).toHaveLength(5);
    const refreshes = calls.filter((c) => c.url.endsWith("/auth/refresh"));
    expect(refreshes.length, "more than one rotation would revoke the family").toBe(1);
    expect(await tokens.getAccessToken()).toBe("new");
  });

  it("signs out and clears tokens when the refresh itself fails", async () => {
    let signedOut = false;
    const { fn } = fakeFetch((url) =>
      url.endsWith("/auth/refresh")
        ? { status: 401, body: { message: "reuse detected" } }
        : { status: 401, body: { message: "expired" } });

    const tokens = memoryTokenStore();
    await tokens.setTokens({ accessToken: "stale", refreshToken: "revoked" });
    const api = createApiClient({
      baseUrl: "http://x/api/v1", tokens, fetch: fn,
      onSignedOut: () => { signedOut = true; },
    });

    await expect(api.accounts.list()).rejects.toBeInstanceOf(ApiError);
    expect(signedOut).toBe(true);
    expect(await tokens.getRefreshToken()).toBeNull();
  });

  it("does not try to refresh a login failure", async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 401, body: { message: "Incorrect email or password" } }));
    const api = createApiClient({ baseUrl: "http://x/api/v1", fetch: fn });
    await expect(api.auth.login({ email: "a@b.co", password: "nope" } as any)).rejects.toThrow();
    expect(calls.some((c) => c.url.endsWith("/auth/refresh"))).toBe(false);
  });
});

describe("requests", () => {
  it("sends the household header only when one is set", async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 200, body: [] }));
    const api = createApiClient({ baseUrl: "http://x/api/v1", fetch: fn });
    await api.accounts.list();
    expect(calls[0].init.headers["X-Household-Id"]).toBeUndefined();
    api.setHousehold("hh_1");
    await api.accounts.list();
    expect(calls[1].init.headers["X-Household-Id"]).toBe("hh_1");
  });

  it("surfaces validation issues from the server", async () => {
    const { fn } = fakeFetch(() => ({
      status: 400,
      body: { message: "Validation failed", issues: [{ path: "amount", message: "too small" }] },
    }));
    const api = createApiClient({ baseUrl: "http://x/api/v1", fetch: fn });
    await api.transactions.create({} as any).then(
      () => { throw new Error("should have thrown"); },
      (e: ApiError) => {
        expect(e.status).toBe(400);
        expect(e.issues?.[0].path).toBe("amount");
      },
    );
  });

  it("uses PATCH for updates and DELETE for removals", async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 200, body: { ok: true } }));
    const api = createApiClient({ baseUrl: "http://x/api/v1", fetch: fn });
    await api.accounts.update("a1", { name: "x" } as any);
    await api.accounts.remove("a1");
    expect(calls.map((c) => c.init.method)).toEqual(["PATCH", "DELETE"]);
  });
});
