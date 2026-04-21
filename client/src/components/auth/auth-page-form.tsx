import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { API_URL } from "@/lib/constants";
import { authApi } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit OTP."),
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

export const AuthPageForm = ({ mode }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setSession, logout } = useAuthStore();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnTo = useMemo(() => resolveReturnTo(params.get("returnTo")), [params]);
  const isSignUp = mode === "sign-up";
  const isVerify = mode === "sign-up-verify";
  const verifyEmail = useMemo(() => params.get("email")?.trim().toLowerCase() ?? "", [params]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState(verifyEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(""));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (isVerify) {
      setEmail(verifyEmail);
      setOtpDigits(Array(6).fill(""));
    }
  }, [isVerify, verifyEmail]);

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
        )}&returnTo=${encodeURIComponent(returnTo)}`
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
      navigate(`/sign-up?returnTo=${encodeURIComponent(returnTo)}`);
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
      toast.success("Account created successfully.");
      navigate(returnTo, { replace: true });
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Verification failed.");
    } finally {
      setLoading(false);
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

    if (nextChar && index < 5) {
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
    if (event.key === "ArrowRight" && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const nextDigits = Array(6).fill("");
    pasted.split("").forEach((char, index) => {
      nextDigits[index] = char;
    });
    setOtpDigits(nextDigits);
    if (errors.otp) {
      setErrors((prev) => ({ ...prev, otp: undefined }));
    }

    const focusIndex = Math.min(pasted.length, 6) - 1;
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
      toast.success("Logged in successfully.");
      navigate(returnTo, { replace: true });
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Sign in failed.");
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    return (
      <section className="mx-auto w-full max-w-md">
        <Card className="border-0 bg-white p-6 text-neutral-900 shadow-none">
          <h1 className="text-2xl font-semibold">You are already signed in</h1>
          <p className="mt-1 text-sm text-neutral-600">{user.email}</p>
          <Button
            className="mt-4 w-full rounded-xl bg-neutral-900 text-white hover:bg-neutral-800"
            onClick={() => navigate(returnTo, { replace: true })}
          >
            Continue
          </Button>
        </Card>
      </section>
    );
  }

  if (isVerify) {
    return (
      <section className="mx-auto w-full max-w-md">
        <Card className="border-0 bg-white p-6 text-neutral-900 shadow-none sm:p-8">
          <header className="space-y-1 text-center">
            <h1 className="text-3xl font-bold tracking-tight">Verify your email</h1>
            <p className="text-sm text-neutral-600">
              Enter the OTP sent to <span className="font-medium text-neutral-800">{verifyEmail}</span>
            </p>
          </header>

          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void verifySignupOtp();
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor="otp" className="text-sm font-medium text-neutral-800">
                OTP
              </label>
              <div className="flex items-center justify-between gap-2">
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
                    className="h-11 w-11 rounded-xl border-neutral-300 bg-white p-0 text-center text-lg font-semibold text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 sm:h-12 sm:w-12"
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
                "Verify OTP"
              )}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-neutral-600">
            Wrong email?{" "}
            <Link to={`/sign-up?returnTo=${encodeURIComponent(returnTo)}`} className="underline">
              Go back
            </Link>
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-md">
      <Card className="border-0 bg-white p-6 text-neutral-900 shadow-none sm:p-8">
        <header className="space-y-1 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            {isSignUp ? "Register" : "Welcome back"}
          </h1>
          <p className="text-sm text-neutral-600">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <Link
              to={`${isSignUp ? "/sign-in" : "/sign-up"}?returnTo=${encodeURIComponent(returnTo)}`}
              className="font-medium underline"
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
              <label htmlFor="name" className="text-sm font-medium text-neutral-800">
                Name
              </label>
              <Input
                id="name"
                placeholder="Enter your full name"
                value={name}
                onChange={(event) => setFieldValue(setName, "name")(event.target.value)}
                autoComplete="name"
                className="h-11 rounded-xl border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900"
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
            <label htmlFor="email" className="text-sm font-medium text-neutral-800">
              Email
            </label>
            <Input
              id="email"
              placeholder="Enter email address"
              value={email}
              onChange={(event) => setFieldValue(setEmail, "email")(event.target.value)}
              autoComplete="email"
              type="email"
              className="h-11 rounded-xl border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900"
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
              <label htmlFor="password" className="text-sm font-medium text-neutral-800">
                Password
              </label>
              {!isSignUp ? (
                <button
                  type="button"
                  className="text-xs text-neutral-600 hover:text-neutral-900"
                  onClick={() => toast.info("Forgot password is coming soon.")}
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
              className="h-11 rounded-xl border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900"
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
              <label htmlFor="confirmPassword" className="text-sm font-medium text-neutral-800">
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
                className="h-11 rounded-xl border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900"
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
            className="h-11 w-full rounded-xl bg-neutral-900 text-white hover:bg-neutral-800"
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
          <div className="h-px flex-1 bg-neutral-200" />
          <span className="text-xs text-neutral-500">OR CONTINUE WITH</span>
          <div className="h-px flex-1 bg-neutral-200" />
        </div>

        <Button
          onClick={startGoogleOAuth}
          disabled={googleLoading}
          variant="outline"
          className="h-11 w-full rounded-xl border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
        >
          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 text-xs font-semibold">
            G
          </span>
          {googleLoading ? "Redirecting..." : "Continue with Google"}
        </Button>

        <p className="mt-5 text-center text-xs text-neutral-500">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </Card>
    </section>
  );
};
