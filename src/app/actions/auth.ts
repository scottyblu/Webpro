"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { siteUrl } from "@/lib/env";
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
    if (error) return { error: error.message === "Invalid login credentials" ? "Incorrect email or password." : error.message };
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
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  let hasSession: boolean;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.full_name, phone: parsed.data.phone ?? "" },
        emailRedirectTo: `${siteUrl()}/auth/callback?next=/dashboard`,
      },
    });
    if (error) return { error: error.message };
    hasSession = !!data.session;
  } catch (err) {
    return { error: problemMessage(err) };
  }

  // Email confirmation ON (recommended): no session yet.
  if (!hasSession) {
    return { ok: true, message: "Check your email to confirm your account, then sign in." };
  }
  redirect("/dashboard");
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
  if (password.length < 8) return { error: "Password must be at least 8 characters" };
  if (password !== formData.get("confirm")) return { error: "Passwords do not match" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
  } catch (err) {
    return { error: problemMessage(err) };
  }
  redirect("/dashboard?password=updated");
}
