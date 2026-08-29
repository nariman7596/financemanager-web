import {
  ApiError,
  type Account, type AccountInput,
  type Budget, type BudgetInput,
  type Category, type CategoryInput,
  type Investment, type InvestmentInput,
  type LoginInput, type RegisterInput,
  type Session, type Transaction, type TransactionInput,
} from "./types";
import type { ChangesPage, Conflict, PushOp, PushResult } from "./sync";

export interface TokenStore {
  getAccessToken(): string | null | Promise<string | null>;
  getRefreshToken(): string | null | Promise<string | null>;
  setTokens(t: { accessToken: string; refreshToken: string }): void | Promise<void>;
  clear(): void | Promise<void>;
}

/** In-memory store. Mobile passes one backed by expo-secure-store instead —
 *  a refresh token is a long-lived credential and must never sit in
 *  AsyncStorage, which is plain unencrypted files on disk. */
export function memoryTokenStore(): TokenStore {
  let access: string | null = null;
  let refresh: string | null = null;
  return {
    getAccessToken: () => access,
    getRefreshToken: () => refresh,
    setTokens: (t) => { access = t.accessToken; refresh = t.refreshToken; },
    clear: () => { access = null; refresh = null; },
  };
}

export interface ClientOptions {
  baseUrl: string;
  tokens?: TokenStore;
  /** Household to act in. Only a preference — the server verifies membership. */
  householdId?: string;
  fetch?: typeof fetch;
  /** Called when refreshing fails, i.e. the user must sign in again. */
  onSignedOut?: () => void;
}

export function createApiClient(options: ClientOptions) {
  const tokens = options.tokens ?? memoryTokenStore();
  const doFetch = options.fetch ?? globalThis.fetch;
  const base = options.baseUrl.replace(/\/$/, "");
  let householdId = options.householdId;

  // One shared refresh promise. Without this, a screen firing five requests
  // that all 401 at once would start five rotations — and rotation revokes the
  // previous token, so four of them would be rejected as reuse and the whole
  // family would be revoked. The client would sign the user out by itself.
  let refreshing: Promise<boolean> | null = null;

  async function refresh(): Promise<boolean> {
    if (!refreshing) {
      refreshing = (async () => {
        const token = await tokens.getRefreshToken();
        if (!token) return false;
        const res = await doFetch(`${base}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: token }),
        });
        if (!res.ok) {
          await tokens.clear();
          options.onSignedOut?.();
          return false;
        }
        await tokens.setTokens(await res.json());
        return true;
      })().finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  async function request<T>(
    path: string,
    init: { method?: string; body?: unknown; retry?: boolean } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const access = await tokens.getAccessToken();
    if (access) headers.Authorization = `Bearer ${access}`;
    if (householdId) headers["X-Household-Id"] = householdId;

    const res = await doFetch(`${base}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    if (res.status === 401 && init.retry !== false && (await refresh())) {
      return request<T>(path, { ...init, retry: false });
    }

    const text = await res.text();
    const payload = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new ApiError(res.status, payload?.message ?? res.statusText, payload?.issues);
    }
    return payload as T;
  }

  function resource<Row, Input>(name: string) {
    return {
      list: (limit?: number) =>
        request<Row[]>(`/${name}${limit ? `?limit=${limit}` : ""}`),
      get: (id: string) => request<Row>(`/${name}/${id}`),
      create: (input: Input) => request<Row>(`/${name}`, { body: input }),
      update: (id: string, input: Partial<Input>) =>
        request<Row>(`/${name}/${id}`, { method: "PATCH", body: input }),
      remove: (id: string) =>
        request<{ ok: true }>(`/${name}/${id}`, { method: "DELETE" }),
    };
  }

  return {
    /** Switch the household subsequent calls act in. */
    setHousehold(id: string | undefined) { householdId = id; },

    auth: {
      async register(input: RegisterInput): Promise<Session> {
        const s = await request<Session>("/auth/register", { body: input, retry: false });
        await tokens.setTokens(s);
        return s;
      },
      async login(input: LoginInput): Promise<Session> {
        const s = await request<Session>("/auth/login", { body: input, retry: false });
        await tokens.setTokens(s);
        return s;
      },
      async logout(): Promise<void> {
        const refreshToken = await tokens.getRefreshToken();
        if (refreshToken) {
          await request("/auth/logout", { body: { refreshToken }, retry: false }).catch(() => {});
        }
        await tokens.clear();
      },
    },

    sync: {
      /** Everything that changed after `cursor`. Pass the cursor back verbatim. */
      changes: (cursor: string, limit = 500) =>
        request<ChangesPage>(`/sync/changes?since=${encodeURIComponent(cursor)}&limit=${limit}`),
      /** Apply a batch of local mutations. Safe to retry: ops carry an opId. */
      push: (deviceId: string, ops: PushOp[]) =>
        request<PushResult>("/sync/push", { body: { deviceId, ops } }),
      conflicts: () => request<Conflict[]>("/sync/conflicts"),
      resolveConflict: (id: string) =>
        request<{ ok: true }>(`/sync/conflicts/${id}/resolve`, { method: "POST" }),
    },

    accounts: resource<Account, AccountInput>("accounts"),
    categories: resource<Category, CategoryInput>("categories"),
    transactions: resource<Transaction, TransactionInput>("transactions"),
    budgets: resource<Budget, BudgetInput>("budgets"),
    investments: resource<Investment, InvestmentInput>("investments"),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
