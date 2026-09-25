/**
 * InspirEd API client (asset-admin). Every Gemini, Drive and database call goes
 * through here, so no secret ever ships in the app bundle.
 *
 * Base URL:
 * - Web: EXPO_PUBLIC_API_URL if set, otherwise same origin (the Vercel deployment).
 * - Native (Expo Go): EXPO_PUBLIC_API_URL, or `RAG_API_URL` in app.json `extra` —
 *   a LAN asset-admin (http://192.168.x.x:3000) or the deployed Vercel URL.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

type Extra = { RAG_API_URL?: string; RAG_API_BASE_URL?: string };

function configuredBaseUrl(): string {
  const extra = (Constants.expoConfig?.extra ??
    Constants.manifest2?.extra?.expoClient?.extra ??
    {}) as Extra;
  const candidates = [
    process.env.EXPO_PUBLIC_API_URL,
    process.env.EXPO_PUBLIC_RAG_API_URL,
    // app.json values only apply to native; a web build is served by its own API.
    Platform.OS === "web" ? undefined : extra.RAG_API_URL,
    Platform.OS === "web" ? undefined : extra.RAG_API_BASE_URL,
  ];
  const raw = candidates.find((v) => v && !v.includes("YOUR_LAN_IP")) || "";
  return raw.replace(/\/$/, "");
}

export function getApiBaseUrl(): string {
  return configuredBaseUrl();
}

/** Resolve a server path (`/uploads/x.pdf`) or pass an absolute URL (Blob storage) through. */
export function resolveApiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const p = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${getApiBaseUrl()}${p}`;
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (Platform.OS !== "web" && !getApiBaseUrl()) {
    throw new Error(
      "API URL is not configured. Set RAG_API_URL in app.json (extra) to your asset-admin or Vercel URL."
    );
  }
  const res = await fetch(resolveApiUrl(path), {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`);
  }
  return data as T;
}

export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body: unknown) => request<T>("POST", path, body);
