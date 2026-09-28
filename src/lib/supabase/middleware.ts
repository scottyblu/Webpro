import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_PREFIXES = ["/admin", "/member-management", "/payment-management", "/reports"];
const MEMBER_PREFIXES = ["/dashboard"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Runs on every page request:
 *  1. refreshes the Supabase auth session cookie
 *  2. sends signed-out visitors on protected pages to /login
 *  3. blocks non-admins from admin pages (server-side, before any page code runs)
 * Admin pages ALSO re-check authorization in their layout and in every server action.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response; // Env not configured yet; pages will show a clear error.

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAdminPath = matches(pathname, ADMIN_PREFIXES);
  const isMemberPath = matches(pathname, MEMBER_PREFIXES);

  if ((isAdminPath || isMemberPath) && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminPath && user) {
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) {
      const home = request.nextUrl.clone();
      home.pathname = "/dashboard";
      home.search = "";
      return NextResponse.redirect(home);
    }
  }

  return response;
}
