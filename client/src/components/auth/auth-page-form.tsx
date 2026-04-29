import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { API_URL } from "@/lib/constants";
import { authApi } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import { usePlayerStore } from "@/store/player-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "sign-in" | "sign-up" | "sign-up-verify";

type Props = {
  mode: Mode;
};

type FieldName = "name" | "email" | "password" | "confirmPassword" | "otp";
type FieldErrors = Partial<Record<FieldName, string>>;

const NAME_REGEX = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,64}$/;

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(64, "Password cannot exceed 64 characters.")
    .regex(
      STRONG_PASSWORD_REGEX,
      "Password must include upper, lower, number, and special character."
    ),
});

const signUpSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(50, "Name cannot exceed 50 characters.")
      .regex(NAME_REGEX, "Name must contain letters only."),
    email: z.string().trim().email("Enter a valid email address."),
    password: z
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
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Password and confirm password do not match.",
      });
    }
  });

const otpSchema = z.object({
  otp: z.string().regex(/^\d{4}$/, "Enter the 4-digit OTP."),
});

const resolveReturnTo = (value: string | null): string =>
  value && value.startsWith("/") ? value : "/home";

const firstFieldErrors = (error: z.ZodError): FieldErrors => {
  const next: FieldErrors = {};
  for (const issue of error.issues) {
    const pathKey = issue.path[0];
    if (typeof pathKey !== "string") continue;
    const key = pathKey as FieldName;
    if (!next[key]) {
      next[key] = issue.message;
    }
  }
  return next;
};

const GoogleGIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M12 10.2v3.9h5.5c-.24 1.26-.96 2.32-2.04 3.04l3.3 2.56c1.92-1.78 3.03-4.39 3.03-7.5 0-.72-.07-1.4-.19-2.06H12z"
    />
    <path
      fill="#34A853"
      d="M12 22c2.7 0 4.96-.89 6.61-2.41l-3.3-2.56c-.92.62-2.09.99-3.31.99-2.55 0-4.71-1.72-5.48-4.03H3.11v2.64A9.99 9.99 0 0 0 12 22z"
    />
    <path
      fill="#4A90E2"
      d="M6.52 13.99A5.98 5.98 0 0 1 6.2 12c0-.69.12-1.36.32-1.99V7.37H3.11A9.99 9.99 0 0 0 2 12c0 1.61.39 3.14 1.11 4.63l3.41-2.64z"
    />
    <path
      fill="#FBBC05"
      d="M12 5.98c1.47 0 2.79.51 3.83 1.5l2.87-2.87C16.95 2.98 14.69 2 12 2 8.11 2 4.76 4.24 3.11 7.37l3.41 2.64c.77-2.31 2.93-4.03 5.48-4.03z"
    />
  </svg>
);

export const AuthPageForm = ({ mode }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setSession, logout } = useAuthStore();
  const setPlaying = usePlayerStore((state) => state.setPlaying);

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnTo = useMemo(() => resolveReturnTo(params.get("returnTo")), [params]);
  const isSignUp = mode === "sign-up";
  const isVerify = mode === "sign-up-verify";
  const verifyEmail = useMemo(() => params.get("email")?.trim().toLowerCase() ?? "", [params]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState(verifyEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(4).fill(""));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [googleLoading, setGoogleLoading] = useState(false);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const authSwitchInFlightRef = useRef(false);

  useEffect(() => {
    if (isVerify) {
      setEmail(verifyEmail);
      setOtpDigits(Array(4).fill(""));
      setResendCooldown(60);
    }
  }, [isVerify, verifyEmail]);

  useEffect(() => {
    if (!isVerify || resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isVerify, resendCooldown]);

  useEffect(() => {
    let cancelled = false;

    const syncSession = async () => {
      const tokenFromQuery = params.get("token");
      const authError = params.get("auth_error");

      if (authError) {
        toast.error(authError);
      }

      if (tokenFromQuery) {
        localStorage.setItem("adfrio_token", tokenFromQuery);
        const nextParams = new URLSearchParams(location.search);
        nextParams.delete("token");
        nextParams.delete("oauth");
        nextParams.delete("auth_error");
        const next = nextParams.toString();
        const nextUrl = `${location.pathname}${next ? `?${next}` : ""}`;
        window.history.replaceState({}, "", nextUrl);
      }

      const token = localStorage.getItem("adfrio_token");
      if (!token) return;

      try {
        const { data } = await authApi.me();
        if (cancelled) return;
        setSession(token, data.user);
        setPlaying(false);
        if (tokenFromQuery) {
          toast.success("Signed in with Google.");
          navigate(returnTo, { replace: true });
        }
      } catch {
        if (cancelled) return;
        logout();
      }
    };

    void syncSession();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, logout, navigate, params, returnTo, setSession]);

  const setFieldValue =
    (setter: (value: string) => void, field: FieldName) => (value: string) => {
      setter(value);
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    };

  const startGoogleOAuth = () => {
    setGoogleLoading(true);
    const callbackPath = `${isSignUp ? "/sign-up" : "/sign-in"}?returnTo=${encodeURIComponent(returnTo)}`;
    const url = `${API_URL}/auth/google/start?returnTo=${encodeURIComponent(callbackPath)}`;
    window.location.assign(url);
  };

  const sendSignupOtp = async () => {
    const parsed = signUpSchema.safeParse({
      name,
      email,
      password,
      confirmPassword,
    });

    if (!parsed.success) {
      setErrors(firstFieldErrors(parsed.error));
      toast.error("Please fix the highlighted fields.");
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      await authApi.signupRequest(
        parsed.data.name.trim().replace(/\s+/g, " "),
        parsed.data.email.trim().toLowerCase(),
        parsed.data.password
      );
      toast.success("OTP sent to your email.");
      navigate(
        `/sign-up/verify?email=${encodeURIComponent(
          parsed.data.email.trim().toLowerCase()
        )}&returnTo=${encodeURIComponent(returnTo)}`,
        { replace: true }
      );
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Unable to send verification code.");
    } finally {
      setLoading(false);
    }
  };

  const verifySignupOtp = async () => {
    if (!verifyEmail) {
      toast.error("Missing email. Please create account again.");
      navigate(`/sign-up?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
      return;
    }

    const otp = otpDigits.join("");
    const parsed = otpSchema.safeParse({ otp });
    if (!parsed.success) {
      setErrors(firstFieldErrors(parsed.error));
      toast.error("Please enter a valid OTP.");
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      const { data } = await authApi.signupVerify(verifyEmail, parsed.data.otp);
      setSession(data.token, data.user);
      setPlaying(false);
      toast.success("Account created successfully.");
      navigate(returnTo, { replace: true });
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const resendSignupOtp = async () => {
    if (!verifyEmail || resendCooldown > 0 || resendLoading) return;
    setResendLoading(true);
    try {
      await authApi.signupResend(verifyEmail);
      setOtpDigits(Array(4).fill(""));
      setErrors((prev) => ({ ...prev, otp: undefined }));
      setResendCooldown(60);
      toast.success("New OTP sent to your email.");
      otpInputRefs.current[0]?.focus();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Unable to resend verification code.");
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

    if (errors.otp) {
      setErrors((prev) => ({ ...prev, otp: undefined }));
    }

    if (nextChar && index < 3) {
      otpInputRefs.current[index + 1]?.focus();
    }
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
    if (errors.otp) {
      setErrors((prev) => ({ ...prev, otp: undefined }));
    }

    const focusIndex = Math.min(pasted.length, 4) - 1;
    if (focusIndex >= 0) {
      otpInputRefs.current[focusIndex]?.focus();
    }
  };

  const signIn = async () => {
    const parsed = signInSchema.safeParse({
      email,
      password,
    });

    if (!parsed.success) {
      setErrors(firstFieldErrors(parsed.error));
      toast.error("Please fix the highlighted fields.");
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      const { data } = await authApi.signIn(parsed.data.email.trim().toLowerCase(), parsed.data.password);
      setSession(data.token, data.user);
      setPlaying(false);
      toast.success("Logged in successfully.");
      navigate(returnTo, { replace: true });
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Sign in failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleAuthModeSwitch = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();

    if (authSwitchInFlightRef.current) {
      return;
    }

    const targetPath = isSignUp ? "/sign-in" : "/sign-up";
    const targetUrl = `${targetPath}?returnTo=${encodeURIComponent(returnTo)}`;
    const currentUrl = `${location.pathname}${location.search}`;

    if (currentUrl === targetUrl) {
      return;
    }

    authSwitchInFlightRef.current = true;
    navigate(targetUrl, { replace: true });
  };

  useEffect(() => {
    authSwitchInFlightRef.current = false;
  }, [location.pathname, location.search]);

  if (user) {
    return <Navigate to={returnTo} replace />;
  }

  if (isVerify && !verifyEmail) {
    return <Navigate replace to={`/sign-up?returnTo=${encodeURIComponent(returnTo)}`} />;
  }

  if (isVerify) {
    return (
      <section className="mx-auto w-full max-w-md">
        <div>
          <header className="space-y-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Verify your email</h1>
            <p className="text-sm text-muted-foreground">
              Enter the OTP sent to <span className="font-semibold text-foreground">{verifyEmail}</span>
            </p>
          </header>

          <form
            className="mt-6 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void verifySignupOtp();
            }}
          >
            <div className="space-y-1.5">
              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {otpDigits.map((digit, index) => (
                  <Input
                    key={`otp-${index}`}
                    id={index === 0 ? "otp" : undefined}
                    ref={(node) => {
                      otpInputRefs.current[index] = node;
                    }}
                    value={digit}
                    onChange={(event) => setOtpDigit(index, event.target.value)}
                    onKeyDown={(event) => handleOtpKeyDown(index, event)}
                    onPaste={handleOtpPaste}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    className="h-12 rounded-2xl border-border/90 bg-card p-0 text-center text-lg font-semibold tracking-[0.04em] text-foreground placeholder:text-muted-foreground focus:border-primary"
                    aria-label={`OTP digit ${index + 1}`}
                    aria-invalid={Boolean(errors.otp)}
                    aria-describedby={errors.otp ? "otp-error" : undefined}
                  />
                ))}
              </div>
              {errors.otp ? (
                <p id="otp-error" className="text-xs text-red-600">
                  {errors.otp}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void resendSignupOtp()}
                disabled={resendLoading || resendCooldown > 0 || loading}
                className="w-full pt-1 text-center text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
              >
                {resendLoading
                  ? "Resending OTP..."
                  : resendCooldown > 0
                    ? `Resend OTP in ${resendCooldown}s`
                    : "Resend OTP"}
              </button>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-xl"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying...
                </span>
              ) : (
                "Verify OTP"
              )}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Wrong email?{" "}
            <Link
              replace
              to={`/sign-up?returnTo=${encodeURIComponent(returnTo)}`}
              className="font-semibold text-foreground underline underline-offset-4"
            >
              Go back
            </Link>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-md">
      <div>
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {isSignUp ? "Create an Account" : "Welcome back"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <Link
              replace
              to={`${isSignUp ? "/sign-in" : "/sign-up"}?returnTo=${encodeURIComponent(returnTo)}`}
              onClick={handleAuthModeSwitch}
              className="font-semibold text-foreground underline underline-offset-4"
            >
              {isSignUp ? "Login" : "Register"}
            </Link>
          </p>
        </header>

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (isSignUp) {
              void sendSignupOtp();
              return;
            }
            void signIn();
          }}
        >
          {isSignUp ? (
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-sm font-medium text-foreground">
                Name
              </label>
              <Input
                id="name"
                placeholder="Enter your full name"
                value={name}
                onChange={(event) => setFieldValue(setName, "name")(event.target.value)}
                autoComplete="name"
                className="h-11 rounded-xl border-border/90 bg-card text-foreground placeholder:text-muted-foreground focus:border-primary"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "name-error" : undefined}
              />
              {errors.name ? (
                <p id="name-error" className="text-xs text-red-600">
                  {errors.name}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <Input
              id="email"
              placeholder="Enter email address"
              value={email}
              onChange={(event) => setFieldValue(setEmail, "email")(event.target.value)}
              autoComplete="email"
              type="email"
              className="h-11 rounded-xl border-border/90 bg-card text-foreground placeholder:text-muted-foreground focus:border-primary"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email ? (
              <p id="email-error" className="text-xs text-red-600">
                {errors.email}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </label>
              {!isSignUp ? (
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
                  onClick={() =>
                    navigate(
                      `/forgot-password?returnTo=${encodeURIComponent(location.pathname + location.search)}`,
                      { replace: true }
                    )
                  }
                >
                  Forgot password?
                </button>
              ) : null}
            </div>
            <Input
              id="password"
              placeholder={isSignUp ? "Create password" : "Enter password"}
              value={password}
              onChange={(event) => setFieldValue(setPassword, "password")(event.target.value)}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              type="password"
              className="h-11 rounded-xl border-border/90 bg-card text-foreground placeholder:text-muted-foreground focus:border-primary"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "password-error" : undefined}
            />
            {errors.password ? (
              <p id="password-error" className="text-xs text-red-600">
                {errors.password}
              </p>
            ) : null}
          </div>

          {isSignUp ? (
            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                Confirm Password
              </label>
              <Input
                id="confirmPassword"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(event) =>
                  setFieldValue(setConfirmPassword, "confirmPassword")(event.target.value)
                }
                autoComplete="new-password"
                type="password"
                className="h-11 rounded-xl border-border/90 bg-card text-foreground placeholder:text-muted-foreground focus:border-primary"
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={errors.confirmPassword ? "confirm-password-error" : undefined}
              />
              {errors.confirmPassword ? (
                <p id="confirm-password-error" className="text-xs text-red-600">
                  {errors.confirmPassword}
                </p>
              ) : null}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-xl"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isSignUp ? "Creating..." : "Logging in..."}
              </span>
            ) : isSignUp ? (
              "Create account"
            ) : (
              "Login"
            )}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border/80" />
          <span className="text-xs tracking-[0.14em] text-muted-foreground">OR CONTINUE WITH</span>
          <div className="h-px flex-1 bg-border/80" />
        </div>

        <Button
          onClick={startGoogleOAuth}
          disabled={googleLoading}
          variant="outline"
          className="h-11 w-full rounded-xl border-border/90 bg-card/85 text-foreground hover:bg-muted/65"
        >
          <span className="mr-2 inline-flex items-center justify-center">
            <GoogleGIcon />
          </span>
          {googleLoading ? "Redirecting..." : "Continue with Google"}
        </Button>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </section>
  );
};

