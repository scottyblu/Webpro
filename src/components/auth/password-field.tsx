"use client";

import { useState } from "react";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { Field, Input } from "@/components/ui/form";
import { cn } from "@/components/ui/cn";
import { PASSWORD_MIN_LENGTH, PASSWORD_RULES } from "@/lib/password";

/** New-password input with show/hide and a live checklist of the password rules. */
export function NewPasswordField({
  id = "password",
  name = "password",
  label = "Password",
  email,
}: {
  id?: string;
  name?: string;
  label?: string;
  email?: string;
}) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  return (
    <Field label={label} htmlFor={id}>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="pr-11"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-stone-500"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      <ul
        className="mt-2 grid gap-1 text-xs sm:grid-cols-2"
        aria-label="Password requirements"
      >
        {PASSWORD_RULES.map((rule) => {
          const ok = value.length > 0 && rule.test(value, email);
          return (
            <li
              key={rule.id}
              className={cn(
                "flex items-center gap-1.5",
                ok ? "text-emerald-700" : "text-stone-500",
              )}
            >
              {ok ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Circle className="h-3 w-3" aria-hidden />
              )}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </Field>
  );
}
