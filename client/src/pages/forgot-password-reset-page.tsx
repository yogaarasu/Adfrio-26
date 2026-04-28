import { useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { authApi } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,64}$/;

const resetSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(64, "Password cannot exceed 64 characters.")
      .regex(
        STRONG_PASSWORD_REGEX,
        "Password must include upper, lower, number, and special character."
      ),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Password and confirm password do not match.",
      });
    }
  });

const resolveReturnTo = (value: string | null): string =>
  value && value.startsWith("/") ? value : "/sign-in";

const resetTokenStorageKey = (email: string): string => `adfrio_reset_token_${email}`;

type FieldName = "newPassword" | "confirmPassword";
type FieldErrors = Partial<Record<FieldName, string>>;

const firstFieldErrors = (error: z.ZodError): FieldErrors => {
  const next: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string") continue;
    if (!next[key as FieldName]) {
      next[key as FieldName] = issue.message;
    }
  }
  return next;
};

export const ForgotPasswordResetPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const email = useMemo(() => params.get("email")?.trim().toLowerCase() ?? "", [params]);
  const returnTo = useMemo(() => resolveReturnTo(params.get("returnTo")), [params]);
  const resetToken = useMemo(
    () => (email ? sessionStorage.getItem(resetTokenStorageKey(email)) ?? "" : ""),
    [email]
  );

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  if (!email) {
    return <Navigate to={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  if (!resetToken) {
    return (
      <Navigate
        to={`/forgot-password/otp?email=${encodeURIComponent(email)}&returnTo=${encodeURIComponent(
          returnTo
        )}`}
        replace
      />
    );
  }

  const resetPassword = async () => {
    const parsed = resetSchema.safeParse({ newPassword, confirmPassword });
    if (!parsed.success) {
      setErrors(firstFieldErrors(parsed.error));
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      await authApi.resetForgotPassword(
        resetToken,
        parsed.data.newPassword,
        parsed.data.confirmPassword
      );
      sessionStorage.removeItem(resetTokenStorageKey(email));
      toast.success("Password changed successfully.");
      navigate(returnTo, { replace: true });
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Password reset failed.");
    } finally {
      setLoading(false);
    }
  };

  const clearFieldError = (field: FieldName) => {
    if (!errors[field]) return;
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <section className="w-full max-w-md">
        <div className="text-neutral-900">
          <header className="space-y-1 text-center">
            <h1 className="text-3xl font-bold tracking-tight">Set New Password</h1>
            <p className="text-sm text-neutral-600">Create and confirm your new password.</p>
          </header>

          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void resetPassword();
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="text-sm font-medium text-neutral-800">
                New Password
              </label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  clearFieldError("newPassword");
                }}
                autoComplete="new-password"
                className="h-11 rounded-xl border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900"
              />
              {errors.newPassword ? <p className="text-xs text-red-600">{errors.newPassword}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm-password" className="text-sm font-medium text-neutral-800">
                Confirm Password
              </label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  clearFieldError("confirmPassword");
                }}
                autoComplete="new-password"
                className="h-11 rounded-xl border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900"
              />
              {errors.confirmPassword ? (
                <p className="text-xs text-red-600">{errors.confirmPassword}</p>
              ) : null}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-xl bg-neutral-900 text-white hover:bg-neutral-800"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              ) : (
                "Update Password"
              )}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-neutral-600">
            <Link
              replace
              to={`/forgot-password/otp?email=${encodeURIComponent(email)}&returnTo=${encodeURIComponent(
                returnTo
              )}`}
              className="underline"
            >
              Back to code
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
};


