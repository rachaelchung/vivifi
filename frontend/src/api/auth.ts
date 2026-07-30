import { apiRequest } from "@/api/client";
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
