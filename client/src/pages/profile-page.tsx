import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { API_URL } from "@/lib/constants";
import { authApi } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import {
  LANGUAGE_OPTIONS,
  type AppLanguage,
  type AppTheme,
  usePreferencesStore
} from "@/store/preferences-store";

const THEME_LABELS: Record<AppTheme, string> = {
  dark: "Dark",
  light: "Light",
  system: "System"
};
const PROFILE_THEME_OPTIONS: AppTheme[] = ["dark", "light", "system"];

const getErrorMessage = (error: unknown, fallback: string): string => {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message?.trim() || fallback;
};

export const ProfilePage = () => {
  const { user, setSession, logout } = useAuthStore();
  const language = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const theme = usePreferencesStore((state) => state.theme);
  const setTheme = usePreferencesStore((state) => state.setTheme);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const syncSession = async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenFromQuery = params.get("token");
      const authError = params.get("auth_error");

      if (authError) {
        setStatus(authError);
      }

      if (tokenFromQuery) {
        localStorage.setItem("adfrio_token", tokenFromQuery);
        params.delete("token");
        params.delete("oauth");
        params.delete("auth_error");
        const next = params.toString();
        const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}`;
        window.history.replaceState({}, "", nextUrl);
      }

      const token = localStorage.getItem("adfrio_token");
      if (!token) return;

      try {
        const { data } = await authApi.me();
        if (cancelled) return;
        setSession(token, data.user);
        if (tokenFromQuery) {
          setStatus("Signed in with Google");
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
  }, [logout, setSession]);

  const startGoogleOAuth = () => {
    setGoogleLoading(true);
    const returnTo = `${window.location.pathname}${window.location.search}`;
    const url = `${API_URL}/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
    window.location.assign(url);
  };

  const requestOtp = async () => {
    try {
      await authApi.requestOtp(email, name || email.split("@")[0]);
      setOtpSent(true);
      setStatus("OTP sent to your email");
    } catch (error) {
      setStatus(getErrorMessage(error, "Could not send OTP"));
    }
  };

  const verifyOtp = async () => {
    try {
      const { data } = await authApi.verifyOtp(email, otp);
      setSession(data.token, data.user);
      setStatus("Signed in successfully");
    } catch (error) {
      setStatus(getErrorMessage(error, "Invalid OTP"));
    }
  };

  const submitPasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setStatus("Please fill all password fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus("New password and confirm password do not match");
      return;
    }

    try {
      setSavingPassword(true);
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setChangePasswordOpen(false);
      setStatus("Password changed successfully");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to change password"));
    } finally {
      setSavingPassword(false);
    }
  };

  const deleteAccount = async () => {
    const confirmed = window.confirm(
      "Delete your account permanently? This will remove your playlists and cannot be undone."
    );
    if (!confirmed) return;

    try {
      setDeletingAccount(true);
      await authApi.deleteAccount();
      logout();
      setStatus("Account deleted");
    } catch (error) {
      setStatus(getErrorMessage(error, "Could not delete account"));
    } finally {
      setDeletingAccount(false);
    }
  };

  const initials = (user?.name ?? "")
    .split(" ")
    .filter(Boolean)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);

  return (
    <section className="mx-auto max-w-2xl space-y-4 text-foreground">
      <h1 className="text-3xl font-bold uppercase tracking-[0.16em]">Profile</h1>

      {user ? (
        <>
          <Card className="p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-base font-semibold">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  <span>{initials || "U"}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{user.name}</p>
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Settings
            </h2>

            <div className="space-y-2">
              <p className="text-sm font-medium">Language</p>
              <Select
                value={language}
                onChange={(event) => setLanguage(event.target.value as AppLanguage)}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Theme</p>
              <Select value={theme} onChange={(event) => setTheme(event.target.value as AppTheme)}>
                {PROFILE_THEME_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {THEME_LABELS[option]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Change Password</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChangePasswordOpen((open) => !open)}
                >
                  {changePasswordOpen ? "Close" : "Open"}
                </Button>
              </div>
              {changePasswordOpen ? (
                <div className="space-y-2">
                  <Input
                    type="password"
                    placeholder="Current password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                  <Button onClick={() => void submitPasswordChange()} disabled={savingPassword}>
                    {savingPassword ? "Saving..." : "Update Password"}
                  </Button>
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <Button onClick={logout} variant="outline">
              Sign Out
            </Button>
            <Button
              onClick={() => void deleteAccount()}
              variant="outline"
              disabled={deletingAccount}
              className="border-red-500/45 text-red-400 hover:bg-red-500/10"
            >
              {deletingAccount ? "Deleting..." : "Delete Account"}
            </Button>
          </Card>
        </>
      ) : (
        <>
          <Card className="space-y-3">
            <h2 className="text-sm uppercase tracking-[0.12em] text-muted-foreground">Google OAuth</h2>
            <Button onClick={startGoogleOAuth} disabled={googleLoading}>
              {googleLoading ? "Redirecting to Google..." : "Continue with Google"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Secure Google sign-in via backend redirect flow
            </p>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm uppercase tracking-[0.12em] text-muted-foreground">OTP Login</h2>
            <Input
              placeholder="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {!otpSent ? (
              <Button onClick={() => void requestOtp()}>Send OTP</Button>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="6-digit OTP"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                />
                <Button onClick={() => void verifyOtp()}>Verify OTP</Button>
              </div>
            )}
          </Card>
        </>
      )}

      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
    </section>
  );
};
