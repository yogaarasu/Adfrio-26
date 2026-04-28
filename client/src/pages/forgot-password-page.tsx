import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { authApi } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const requestSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

const resolveReturnTo = (value: string | null): string =>
  value && value.startsWith("/") ? value : "/sign-in";

export const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnTo = useMemo(() => resolveReturnTo(params.get("returnTo")), [params]);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const sendOtp = async () => {
    const parsed = requestSchema.safeParse({ email });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? "Enter a valid email.");
      return;
    }

    setEmailError(null);
    setLoading(true);
    try {
      await authApi.requestForgotPasswordOtp(parsed.data.email.trim().toLowerCase());
      toast.success("OTP sent to your email.");
      navigate(
        `/forgot-password/otp?email=${encodeURIComponent(
          parsed.data.email.trim().toLowerCase()
        )}&returnTo=${encodeURIComponent(returnTo)}`,
        { replace: true }
      );
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Could not send OTP.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <section className="w-full max-w-md">
        <div className="text-neutral-900">
          <header className="space-y-1 text-center">
            <h1 className="text-3xl font-bold tracking-tight">Forgot Password</h1>
            <p className="text-sm text-neutral-600">Enter your account email to continue.</p>
          </header>

          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void sendOtp();
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-neutral-800">
                Email
              </label>
              <Input
                id="email"
                placeholder="Enter email address"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError) setEmailError(null);
                }}
                autoComplete="email"
                type="email"
                className="h-11 rounded-xl border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900"
              />
              {emailError ? <p className="text-xs text-red-600">{emailError}</p> : null}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-xl bg-neutral-900 text-white hover:bg-neutral-800"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending OTP...
                </span>
              ) : (
                "Continue"
              )}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-neutral-600">
            <Link replace to={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`} className="underline">
              Back to Sign In
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
};


