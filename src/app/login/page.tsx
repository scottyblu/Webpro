import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your Breakfast Club account."
      footer={
        <>
          New member?{" "}
          <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      {error && (
        <Alert tone="error" className="mb-4">
          That link didn&apos;t work. It may have expired, already been used, or been opened in a different browser.
          If you were confirming your email, try signing in below. If it says your email isn&apos;t confirmed, tap
          &quot;Resend confirmation email&quot;.
        </Alert>
      )}
      <LoginForm next={next} />
    </AuthShell>
  );
}
