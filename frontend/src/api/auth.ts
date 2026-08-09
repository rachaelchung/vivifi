import { apiRequest, apiBaseUrl } from "@/api/client";
import type { AuthTokenResponse, User } from "@/api/types";

export interface RegisterPayload {
  email: string;
  username: string;
  name: string;
  password: string;
}

export interface LoginPayload {
  identifier: string;
  password: string;
}

export interface AuthProviders {
  google: boolean;
}

export function register(payload: RegisterPayload): Promise<AuthTokenResponse> {
  return apiRequest<AuthTokenResponse>("/auth/register", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

export function login(payload: LoginPayload): Promise<AuthTokenResponse> {
  return apiRequest<AuthTokenResponse>("/auth/login", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

export function fetchMe(): Promise<User> {
  return apiRequest<User>("/auth/me");
}

export function fetchAuthProviders(): Promise<AuthProviders> {
  return apiRequest<AuthProviders>("/auth/providers", { auth: false });
}

/** Full-page navigation target that starts the Google OAuth dance. */
export function googleAuthUrl(): string {
  return `${apiBaseUrl}/auth/google`;
}
