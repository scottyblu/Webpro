"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { siteUrl } from "@/lib/env";
import { passwordProblem } from "@/lib/password";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

/**
 * Turn an unexpected failure (usually a missing or mistyped setting in Vercel)
 * into a message the person can act on, instead of a blank crash page.
 * Messages never contain key values.
 */
function problemMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[auth] unexpected error", err);
  if (message.includes("Missing environment variable")) {
    const name = /Missing environment variable (\w+)/.exec(message)?.[1] ?? "a setting";
    return `The app is missing the ${name} setting in Vercel. Open /setup-check for details.`;
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|Invalid URL/i.test(message)) {
    return "The app couldn't reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL in Vercel (open /setup-check for details).";
  }
  return `Something went wrong: ${message}`;
}

/**
 * Compare emails the way the mailbox provider does: case-insensitive, and for Gmail
 * ignoring dots and "+anything" (john.smith+club@gmail.com is johnsmith@gmail.com).
 */
function mailboxKey(email: string): string {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.split("+")[0]!.replace(/\./g, "")}@gmail.com`;
  }
  return `${local}@${domain}`;
}

/** Is there already a member/account using this mailbox? */
async function mailboxAlreadyRegistered(email: string): Promise<boolean> {
  const key = mailboxKey(email);
  const db = createAdminClient();
  // Members an admin added who haven't created a login yet are allowed: registering links them.
  const { data } = await db.from("members").select("email").not("user_id", "is", null).range(0, 4999);
  if ((data ?? []).some((m) => mailboxKey(m.email as string) === key)) return true;
  const { data: admins } = await db.from("admin_users").select("email");
  return (admins ?? []).some((a) => mailboxKey(a.email as string) === key);
}

const ALREADY_REGISTERED =
  "An account with this email already exists. Sign in instead, or use \"Forgot password?\" if you don't remember your password.";

/** Only allow redirects to paths on this site. */
function safeNext(next: FormDataEntryValue | null): string | null {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  let destination: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      if (error.name === "AuthRetryableFetchError") return { error: problemMessage(new Error("fetch failed")) };
      if (error.code === "email_not_confirmed" || /not confirmed/i.test(error.message)) {
        return {
          error: "Please confirm your email first. Open the confirmation email we sent you and tap the link.",
          unconfirmedEmail: parsed.data.email,
        };
      }
      return { error: error.message === "Invalid login credentials" ? "Incorrect email or password." : error.message };
    }
    if (!data.user.email_confirmed_at) {
      await supabase.auth.signOut();
      return {
        error: "Please confirm your email first. Open the confirmation email we sent you and tap the link.",
        unconfirmedEmail: parsed.data.email,
      };
    }
    const { data: admin } = await supabase.from("admin_users").select("id").eq("user_id", data.user.id).maybeSingle();
    destination = safeNext(formData.get("next")) ?? (admin ? "/admin" : "/dashboard");
  } catch (err) {
    return { error: problemMessage(err) };
  }
  redirect(destination);
}

const signUpSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.string().trim().email("Enter a valid email address"),
  phone: z.string().trim().max(30).optional(),
  password: z.string().max(200),
});

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const weak = passwordProblem(parsed.data.password, parsed.data.email);
  if (weak) return { error: weak };
  if (parsed.data.password !== formData.get("confirm")) return { error: "The two passwords don't match." };

  let hasSession: boolean;
  try {
    if (await mailboxAlreadyRegistered(parsed.data.email)) return { error: ALREADY_REGISTERED };

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.full_name, phone: parsed.data.phone ?? "" },
        emailRedirectTo: `${siteUrl()}/auth/callback?next=/dashboard`,
      },
    });
    if (error) {
      if (error.code === "user_already_exists" || /already registered|already exists/i.test(error.message)) {
        return { error: ALREADY_REGISTERED };
      }
      if (error.code === "weak_password") return { error: `Please choose a stronger password. ${error.message}` };
      if (error.name === "AuthRetryableFetchError") return { error: problemMessage(new Error("fetch failed")) };
      return { error: error.message };
    }
    // Supabase hides whether an email is taken: an existing account comes back with no identities.
    if (data.user && (data.user.identities?.length ?? 0) === 0) return { error: ALREADY_REGISTERED };
    hasSession = !!data.session;
  } catch (err) {
    return { error: problemMessage(err) };
  }

  // Email confirmation ON (required): no session until they tap the link in the email.
  if (!hasSession) {
    return {
      ok: true,
      message: `Almost done! We sent a confirmation link to ${parsed.data.email}. Tap it to activate your account, then sign in.`,
      unconfirmedEmail: parsed.data.email,
    };
  }
  redirect("/dashboard");
}

/** Send the "confirm your email" message again. */
export async function resendConfirmation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.string().trim().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.data,
      options: { emailRedirectTo: `${siteUrl()}/auth/callback?next=/dashboard` },
    });
    if (error) {
      if (error.status === 429 || /rate limit|seconds/i.test(error.message)) {
        return { error: "Please wait a minute before asking for another email." };
      }
      return { error: error.message };
    }
  } catch (err) {
    return { error: problemMessage(err) };
  }
  return { ok: true, message: `Sent! Check ${email.data} (and your spam folder) for the new link.` };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.string().trim().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email address" };
  try {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
    });
  } catch (err) {
    return { error: problemMessage(err) };
  }
  // Same response whether or not the account exists.
  return { ok: true, message: "If that email has an account, a reset link is on its way." };
}

export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  if (password !== formData.get("confirm")) return { error: "The two passwords don't match." };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const weak = passwordProblem(password, user?.email);
    if (weak) return { error: weak };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
  } catch (err) {
    return { error: problemMessage(err) };
  }
  redirect("/dashboard?password=updated");
}
