/**
 * Thin typed fetch client for the Nero backend.
 * Every module's frontend data access goes through here so the base URL, error
 * shape and (later) auth live in one place.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`API ${status}: ${detail}`);
    this.name = "ApiError";
  }
}

export async function api<T>(
  path: string,
  init?: RequestInit & { params?: Record<string, string | number | undefined> },
): Promise<T> {
  const url = new URL(`/v1${path}`, API_BASE_URL);
  for (const [k, v] of Object.entries(init?.params ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json())?.detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

/** Is the backend reachable? Used by the foundation / status screen. */
export async function pingBackend(): Promise<boolean> {
  try {
    await api("/health");
    return true;
  } catch {
    return false;
  }
}
