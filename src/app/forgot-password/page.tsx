import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to choose a new password."
      footer={
        <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          Back to sign in
        </Link>
      }
    >
      {error === "browser" && (
        <Alert tone="warning" className="mb-4">
          That reset link was opened in a different browser than the one you requested it from (for example inside the
          Gmail app). Request a new link below. When the email arrives, press and hold the button and choose
          &quot;Open in Safari&quot; (or Chrome).
        </Alert>
      )}
      {error === "expired" && (
        <Alert tone="error" className="mb-4">
          That reset link has expired or was already used. Request a new one below.
        </Alert>
      )}
      <ForgotPasswordForm />
    </AuthShell>
  );
}
