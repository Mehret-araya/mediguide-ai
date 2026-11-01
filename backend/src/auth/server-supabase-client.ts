import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface ServerSupabaseEnvironment {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

function isLocalHostname(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

export function createServerSupabaseClient(
  environment: ServerSupabaseEnvironment = process.env,
): SupabaseClient {
  const rawUrl = environment.SUPABASE_URL?.trim();
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!rawUrl || !serviceRoleKey) {
    throw new Error("Server-side Supabase configuration is incomplete.");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Server-side Supabase configuration is invalid.");
  }

  const localHttp =
    url.protocol === "http:" && isLocalHostname(url.hostname);

  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error("Server-side Supabase configuration is invalid.");
  }

  return createClient(url.origin, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
