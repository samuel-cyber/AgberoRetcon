/**
 * AgberoRecon API Client
 * Interfaces with the live Express/PostgreSQL settlement backend
 */

export interface Transaction {
  id: string;
  plateNumber: string;
  phone: string;
  amount: number;
  status: "PAID" | "UNPAID";
  createdAt: string;
  localDate: string;
  localTime: string;
  isNew?: boolean;
}

export interface TransactionsResponse {
  count: number;
  transactions: Transaction[];
  serverTime: string;
}

export interface DashboardSummary {
  date: string;
  totalCollected: number;
  paidCount: number;
  unpaidCount: number;
  plateCount: number;
}

export interface SummaryResponse {
  summary: DashboardSummary;
  serverTime: string;
}

export interface VehicleStatus {
  plateNumber: string;
  status: "PAID" | "UNPAID";
  registered: boolean;
  paidAt: string | null;
  amount: number | null;
  checkedAt: string;
}

export interface TransactionFilters {
  limit?: number;
  status?: "PAID" | "UNPAID" | "ALL";
  plate?: string;
  date?: "today" | "all" | string;
}

export const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || "https://agberoretcon.onrender.com";

export function getBaseApiUrl(): string {
  if (typeof window !== "undefined") {
    const override = localStorage.getItem("agbero_api_url");
    if (override && override.trim()) {
      return override.trim().replace(/\/+$/, "");
    }
  }
  return DEFAULT_API_URL.replace(/\/+$/, "");
}

export function getApiKey(): string {
  if (typeof window !== "undefined") {
    const key = localStorage.getItem("agbero_api_key");
    if (key && key.trim()) return key.trim();
  }
  return process.env.NEXT_PUBLIC_DASHBOARD_API_KEY?.trim() || "";
}

function getHeaders(apiKey?: string): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/json",
  };
  const key = apiKey || getApiKey();
  if (key) {
    headers["x-api-key"] = key;
  }
  return headers;
}

/**
 * Checks backend health status
 */
export async function checkBackendHealth(
  baseUrl = getBaseApiUrl()
): Promise<{ ok: boolean; statusText: string; latencyMs: number }> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(`${baseUrl}/health`, {
      method: "GET",
      headers: getHeaders(),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - start);

    if (res.ok) {
      return { ok: true, statusText: "Online", latencyMs };
    }
    return { ok: false, statusText: `HTTP ${res.status}`, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - start);
    const msg = err instanceof Error ? err.message : "Unreachable";
    return { ok: false, statusText: msg, latencyMs };
  }
}

/**
 * Fetches today's settlement summary numbers for KPI cards
 */
export async function fetchDashboardSummary(
  baseUrl = getBaseApiUrl(),
  apiKey = getApiKey()
): Promise<SummaryResponse> {
  const res = await fetch(`${baseUrl}/transactions/summary`, {
    method: "GET",
    headers: getHeaders(apiKey),
    cache: "no-store",
  });

  if (!res.ok) {
    let errorMsg = `Failed to fetch summary: HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) errorMsg = body.error;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return res.json();
}

/**
 * Fetches transactions from the ledger feed with optional filters
 */
export async function fetchTransactions(
  filters: TransactionFilters = {},
  baseUrl = getBaseApiUrl(),
  apiKey = getApiKey()
): Promise<TransactionsResponse> {
  const params = new URLSearchParams();

  if (filters.limit) {
    params.set("limit", String(Math.min(filters.limit, 200)));
  }
  if (filters.status && filters.status !== "ALL") {
    params.set("status", filters.status);
  }
  if (filters.plate && filters.plate.trim()) {
    params.set("plate", filters.plate.trim());
  }
  if (filters.date) {
    params.set("date", filters.date);
  }

  const queryString = params.toString();
  const url = `${baseUrl}/transactions${queryString ? `?${queryString}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: getHeaders(apiKey),
    cache: "no-store",
  });

  if (!res.ok) {
    let errorMsg = `Failed to fetch transactions: HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) errorMsg = body.error;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return res.json();
}

/**
 * Performs a live plate check against the backend
 */
export async function fetchVehicleStatus(
  plate: string,
  baseUrl = getBaseApiUrl(),
  apiKey = getApiKey()
): Promise<VehicleStatus> {
  const cleanedPlate = plate.trim();
  if (!cleanedPlate) {
    throw new Error("Vehicle plate number is required");
  }

  const res = await fetch(
    `${baseUrl}/vehicles/${encodeURIComponent(cleanedPlate)}/status`,
    {
      method: "GET",
      headers: getHeaders(apiKey),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    let errorMsg = `Failed to lookup vehicle: HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) errorMsg = body.error;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return res.json();
}
