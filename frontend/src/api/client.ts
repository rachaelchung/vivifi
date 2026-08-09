const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const TOKEN_KEY = "vivifi.token";

/** Public API origin (no trailing slash). Used for full-page OAuth redirects. */
export const apiBaseUrl = API_BASE_URL.replace(/\/$/, "");

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token === null) {
    localStorage.removeItem(TOKEN_KEY);
  } else {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`${status}: ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
}

export async function apiRequest<T>(
  path: string,
  { method = "GET", body, auth = true }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      "Couldn't reach the server. Check your connection and try again.",
    );
  }

  return finalizeResponse<T>(response);
}

interface UploadOptions {
  auth?: boolean;
}

/** Multipart upload variant. Do NOT set Content-Type manually — the browser
 * fills in the correct multipart boundary. */
export async function apiUpload<T>(
  path: string,
  form: FormData,
  { auth = true }: UploadOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers,
      body: form,
    });
  } catch {
    throw new ApiError(
      0,
      "Couldn't reach the server. Check your connection and try again.",
    );
  }

  return finalizeResponse<T>(response);
}

async function finalizeResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const raw = await response.text();
  const parsed = raw ? safeJson(raw) : undefined;

  if (!response.ok) {
    const detail = extractDetail(parsed) ?? response.statusText ?? "Request failed";
    throw new ApiError(response.status, detail);
  }

  return parsed as T;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function extractDetail(parsed: unknown): string | null {
  if (parsed && typeof parsed === "object" && "detail" in parsed) {
    const detail = (parsed as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    // Pydantic sometimes returns detail as an array of validation errors.
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (first && typeof first === "object" && "msg" in first) {
        return String((first as { msg: unknown }).msg);
      }
    }
  }
  return null;
}
