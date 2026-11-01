import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface SupabaseUserClientEnvironment {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export function createUserSupabaseClient(
  accessToken: string,
  environment: SupabaseUserClientEnvironment = process.env,
): SupabaseClient {
  const rawUrl = environment.SUPABASE_URL?.trim();
  const anonKey = environment.SUPABASE_ANON_KEY?.trim();

  if (!rawUrl || !anonKey || !accessToken.trim()) {
    throw new Error("User-scoped Supabase configuration is incomplete.");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("User-scoped Supabase configuration is invalid.");
  }

  const localHttp =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error("User-scoped Supabase configuration is invalid.");
  }

  return createClient(url.origin, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
