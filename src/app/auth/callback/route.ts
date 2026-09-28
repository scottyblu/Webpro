import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles links from Supabase emails (confirm signup, invite, password reset).
 * Supports both the PKCE `code` flow and the `token_hash` flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  const isPasswordReset = next === "/reset-password";

  // Supabase couldn't verify the link at all (expired or already used).
  const linkError = searchParams.get("error_code") ?? searchParams.get("error");
  if (linkError) {
    return NextResponse.redirect(
      isPasswordReset ? `${origin}/forgot-password?error=expired` : `${origin}/login?error=expired`,
    );
  }

  const supabase = await createClient();
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);

    // The link was opened in a different browser than the one used to sign up
    // (e.g. inside the Gmail app). Supabase has already verified the email at
    // this point; only the automatic sign-in can't be completed here.
    if (error.code === "pkce_code_verifier_not_found") {
      return NextResponse.redirect(
        isPasswordReset ? `${origin}/forgot-password?error=browser` : `${origin}/login?confirmed=1`,
      );
    }
  }

  return NextResponse.redirect(isPasswordReset ? `${origin}/forgot-password?error=expired` : `${origin}/login?error=link`);
}
