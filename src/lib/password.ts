/**
 * Password rules, shared by the sign-up / reset forms (live checklist)
 * and the server (which enforces them).
 */
export const PASSWORD_MIN_LENGTH = 10;

const COMMON = new Set([
  "password", "password1", "password123", "passw0rd", "qwerty", "qwerty123", "letmein", "welcome",
  "welcome1", "iloveyou", "admin", "abc123", "123456", "12345678", "123456789", "1234567890",
  "breakfast", "breakfastclub", "monkey", "football", "baseball", "dragon", "sunshine", "princess",
]);

export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string, email?: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { id: "upper", label: "An uppercase letter (A–Z)", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", label: "A lowercase letter (a–z)", test: (p) => /[a-z]/.test(p) },
  { id: "number", label: "A number (0–9)", test: (p) => /\d/.test(p) },
  { id: "symbol", label: "A symbol (like ! @ # $ %)", test: (p) => /[^A-Za-z0-9]/.test(p) },
  {
    id: "personal",
    label: "Not your email or a common password",
    test: (p, email) => {
      const lower = p.toLowerCase();
      const bare = lower.replace(/[^a-z]/g, "");
      if (COMMON.has(lower) || COMMON.has(bare)) return false;
      const name = email?.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "");
      return !(name && name.length >= 4 && lower.replace(/[^a-z0-9]/g, "").includes(name));
    },
  },
];

/** First unmet rule as a sentence, or null if the password is strong enough. */
export function passwordProblem(password: string, email?: string): string | null {
  const failed = PASSWORD_RULES.find((r) => !r.test(password, email));
  return failed ? `Password needs: ${failed.label.charAt(0).toLowerCase()}${failed.label.slice(1)}.` : null;
}
