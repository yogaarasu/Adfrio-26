import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { authApi } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import {
  LANGUAGE_OPTIONS,
  type AppLanguage,
  type AppTheme,
  usePreferencesStore,
} from "@/store/preferences-store";
import { usePlayerStore } from "@/store/player-store";
import { cn } from "@/lib/utils";

const THEME_LABELS: Record<AppTheme, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};
const PROFILE_THEME_OPTIONS: AppTheme[] = ["dark", "light", "system"];

const getErrorMessage = (error: unknown, fallback: string): string => {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message?.trim() || fallback;
};

const colorFromName = (name: string): string => {
  const seed = name.trim().toLowerCase() || "user";
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  return `hsl(${hash} 72% 45%)`;
};

type ConfirmAction = "logout" | "delete-account" | null;

export const ProfilePage = () => {
  const { user, setSession, logout } = useAuthStore();
  const language = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const theme = usePreferencesStore((state) => state.theme);
  const setTheme = usePreferencesStore((state) => state.setTheme);
  const hasMiniPlayer = usePlayerStore(
    (state) => Boolean(state.current) && !state.video.active
  );

  const [deletingAccount, setDeletingAccount] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  useEffect(() => {
    let cancelled = false;

    const syncSession = async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenFromQuery = params.get("token");
      const authError = params.get("auth_error");

      if (authError) {
        toast.error(authError);
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
          toast.success("Signed in with Google.");
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

  const confirmLogout = () => {
    logout();
    toast.success("Logged out successfully.");
    setConfirmAction(null);
  };

  const confirmDeleteAccount = async () => {
    try {
      setDeletingAccount(true);
      await authApi.deleteAccount();
      logout();
      toast.success("Account deleted.");
      setConfirmAction(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not delete account."));
    } finally {
      setDeletingAccount(false);
    }
  };

  const firstLetter = (user?.name?.trim().charAt(0) ?? "U").toUpperCase();
  const avatarBg = colorFromName(user?.name ?? "");

  return (
    <>
      <section
        className={cn(
          "mx-auto max-w-2xl space-y-4 text-foreground",
          hasMiniPlayer ? "pb-24 md:pb-12" : ""
        )}
      >
        <h1 className="text-3xl font-bold uppercase tracking-[0.16em]">Profile</h1>

        {user ? (
          <>
            <Card className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-base font-semibold">
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
                    ) : (
                      <span
                        className="flex h-full w-full items-center justify-center text-lg font-semibold text-white"
                        style={{ backgroundColor: avatarBg }}
                      >
                        {firstLetter}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">{user.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setConfirmAction("logout")}>
                  Logout
                </Button>
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
            </Card>

            <Card className="space-y-3 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-red-500">Danger Zone</h2>
              <p className="text-sm text-muted-foreground">
                Deleting your account permanently removes your profile and playlists. This cannot be undone.
              </p>
              <Button
                onClick={() => setConfirmAction("delete-account")}
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
            <Card className="space-y-3 p-5">
              <h2 className="text-lg font-semibold">Welcome to Adfrio</h2>
              <p className="text-sm text-muted-foreground">
                Sign in to sync playlists, save your profile, and continue playback across devices.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link to="/sign-in">
                  <Button size="sm">Sign In</Button>
                </Link>
                <Link to="/sign-up">
                  <Button size="sm" variant="outline">
                    Register
                  </Button>
                </Link>
              </div>
            </Card>
          </>
        )}
      </section>

      <div
        className={cn(
          "fixed inset-0 z-[70] transition-opacity duration-300",
          confirmAction ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/55"
          onClick={() => setConfirmAction(null)}
          aria-label="Close confirmation"
        />
        <section
          className={cn(
            "absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-border bg-card p-5 transition-all duration-300",
            confirmAction ? "-translate-y-1/2 opacity-100" : "translate-y-6 opacity-0"
          )}
          aria-label="Confirmation dialog"
        >
          <h3 className="text-base font-semibold">
            {confirmAction === "logout" ? "Confirm Logout" : "Delete Account?"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {confirmAction === "logout"
              ? "Are you sure you want to log out from this account?"
              : "This action is permanent and cannot be undone. Continue?"}
          </p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            {confirmAction === "logout" ? (
              <Button onClick={confirmLogout}>Logout</Button>
            ) : (
              <Button
                onClick={() => void confirmDeleteAccount()}
                className="border-red-500/45 bg-red-500 text-white hover:bg-red-600"
                disabled={deletingAccount}
              >
                {deletingAccount ? "Deleting..." : "Delete Account"}
              </Button>
            )}
          </div>
        </section>
      </div>
    </>
  );
};
