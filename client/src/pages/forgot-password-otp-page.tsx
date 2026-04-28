import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { authApi } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const otpSchema = z.object({
  otp: z.string().regex(/^\d{4}$/, "Enter the 4-digit code."),
});

const resolveReturnTo = (value: string | null): string =>
  value && value.startsWith("/") ? value : "/sign-in";

const resetTokenStorageKey = (email: string): string => `adfrio_reset_token_${email}`;

export const ForgotPasswordOtpPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const email = useMemo(() => params.get("email")?.trim().toLowerCase() ?? "", [params]);
  const returnTo = useMemo(() => resolveReturnTo(params.get("returnTo")), [params]);

  const [otpDigits, setOtpDigits] = useState<string[]>(Array(4).fill(""));
  const [otpError, setOtpError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  if (!email) {
    return <Navigate to={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  const verifyOtp = async () => {
    const parsed = otpSchema.safeParse({ otp: otpDigits.join("") });
    if (!parsed.success) {
      setOtpError(parsed.error.issues[0]?.message ?? "Enter valid code.");
      return;
    }

    setOtpError(null);
    setLoading(true);
    try {
      const { data } = await authApi.verifyForgotPasswordOtp(email, parsed.data.otp);
      sessionStorage.setItem(resetTokenStorageKey(email), data.resetToken);
      toast.success("Code verified.");
      navigate(
        `/forgot-password/reset?email=${encodeURIComponent(email)}&returnTo=${encodeURIComponent(
          returnTo
        )}`
      );
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Code verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    setResendLoading(true);
    try {
      await authApi.requestForgotPasswordOtp(email);
      setOtpDigits(Array(4).fill(""));
      setOtpError(null);
      toast.success("New code sent to your email.");
      otpInputRefs.current[0]?.focus();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Could not resend code.");
    } finally {
      setResendLoading(false);
    }
  };

  const setOtpDigit = (index: number, nextRaw: string) => {
    const nextChar = nextRaw.replace(/\D/g, "").slice(-1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = nextChar;
      return next;
    });
    if (otpError) setOtpError(null);
    if (nextChar && index < 3) otpInputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowRight" && index < 3) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!pasted) return;
    const nextDigits = Array(4).fill("");
    pasted.split("").forEach((char, index) => {
      nextDigits[index] = char;
    });
    setOtpDigits(nextDigits);
    if (otpError) setOtpError(null);
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <section className="w-full max-w-md">
        <Card className="rounded-none border-0 bg-white p-6 text-neutral-900 shadow-none backdrop-blur-0 sm:p-8">
          <header className="space-y-1 text-center">
            <h1 className="text-3xl font-bold tracking-tight">Verify Code</h1>
            <p className="text-sm text-neutral-600">
              Enter the 4-digit code sent to <span className="font-medium">{email}</span>.
            </p>
          </header>

          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void verifyOtp();
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor="otp" className="text-sm font-medium text-neutral-800">
                Code
              </label>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {otpDigits.map((digit, index) => (
                  <Input
                    key={`otp-forgot-${index}`}
                    id={index === 0 ? "otp" : undefined}
                    ref={(node) => {
                      otpInputRefs.current[index] = node;
                    }}
                    value={digit}
                    onChange={(event) => setOtpDigit(index, event.target.value)}
                    onKeyDown={(event) => handleOtpKeyDown(index, event)}
                    onPaste={handleOtpPaste}
                    inputMode="numeric"
                    maxLength={1}
                    className="h-10 w-10 rounded-xl border-neutral-300 bg-white/70 p-0 text-center text-lg font-semibold text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 sm:h-12 sm:w-12"
                  />
                ))}
              </div>
              {otpError ? <p className="text-xs text-red-600">{otpError}</p> : null}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-xl bg-neutral-900 text-white hover:bg-neutral-800"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying...
                </span>
              ) : (
                "Verify Code"
              )}
            </Button>

            <button
              type="button"
              onClick={() => void resendOtp()}
              disabled={loading || resendLoading}
              className="w-full text-sm font-medium text-neutral-700 underline-offset-4 transition hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resendLoading ? "Resending OTP..." : "Resend OTP"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-neutral-600">
            <Link to={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`} className="underline">
              Change email
            </Link>
          </p>
        </Card>
      </section>
    </div>
  );
};


