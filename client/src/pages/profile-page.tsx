import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { API_URL } from "@/lib/constants";
import { authApi } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import { LANGUAGE_OPTIONS, type AppLanguage, usePreferencesStore } from "@/store/preferences-store";

type DeferredPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export const ProfilePage = () => {
  const { user, setSession, logout } = useAuthStore();
  const language = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const videoAutoplay = usePreferencesStore((state) => state.videoAutoplay);
  const setVideoAutoplay = usePreferencesStore((state) => state.setVideoAutoplay);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<DeferredPromptEvent | null>(null);
  const [installAvailable, setInstallAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);

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

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    setInstalled(standalone);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as DeferredPromptEvent);
      setInstallAvailable(true);
    };

    const onAppInstalled = () => {
      setInstallAvailable(false);
      setInstallPrompt(null);
      setInstalled(true);
      setStatus("Adfrio installed successfully");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const startGoogleOAuth = () => {
    setGoogleLoading(true);
    const returnTo = `${window.location.pathname}${window.location.search}`;
    const url = `${API_URL}/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
    window.location.assign(url);
  };

  const requestOtp = async () => {
    await authApi.requestOtp(email, name || email.split("@")[0]);
    setOtpSent(true);
    setStatus("OTP sent to your email");
  };

  const verifyOtp = async () => {
    const { data } = await authApi.verifyOtp(email, otp);
    setSession(data.token, data.user);
    setStatus("Signed in successfully");
  };

  const installApp = async () => {
    if (installed) {
      setStatus("Adfrio is already installed on this device");
      return;
    }

    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const result = await installPrompt.userChoice;
        setStatus(result.outcome === "accepted" ? "Installing Adfrio..." : "Install dismissed");
      } catch {
        setStatus("Install failed. Please try again.");
      } finally {
        setInstallPrompt(null);
        setInstallAvailable(false);
      }
      return;
    }

    const ua = navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    if (isIos) {
      setStatus("On iPhone/iPad: Share button -> Add to Home Screen");
      return;
    }

    setStatus("Open browser menu and choose Install App or Add to Home Screen");
  };

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h1 className="text-3xl font-bold uppercase tracking-[0.16em]">Profile</h1>

      <Card className="space-y-3">
        <h2 className="text-sm uppercase tracking-[0.12em] text-white/70">Language Preference</h2>
        <p className="text-xs text-white/60">
          Selected language controls Songs and Videos shown in Home and Search.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setLanguage(option as AppLanguage)}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                language === option
                  ? "border-white bg-white text-black"
                  : "border-white/20 bg-white/5 text-white hover:bg-white/10"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm uppercase tracking-[0.12em] text-white/70">Install App</h2>
        <p className="text-xs text-white/60">
          Install Adfrio for quick access and app-like experience.
        </p>
        <Button onClick={() => void installApp()}>
          {installed ? "Installed" : installAvailable ? "Install Adfrio" : "Install Adfrio"}
        </Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm uppercase tracking-[0.12em] text-white/70">Video Autoplay</h2>
        <p className="text-xs text-white/60">
          When ON, next related video plays automatically after current video ends.
        </p>
        <Button onClick={() => setVideoAutoplay(!videoAutoplay)}>
          {videoAutoplay ? "Autoplay ON" : "Autoplay OFF"}
        </Button>
      </Card>

      {user ? (
        <Card className="space-y-3">
          <p className="text-lg font-semibold">{user.name}</p>
          <p className="text-sm text-white/70">{user.email}</p>
          <Button onClick={logout}>Log out</Button>
        </Card>
      ) : (
        <>
          <Card className="space-y-3">
            <h2 className="text-sm uppercase tracking-[0.12em] text-white/70">Google OAuth</h2>
            <Button onClick={startGoogleOAuth} disabled={googleLoading}>
              {googleLoading ? "Redirecting to Google..." : "Continue with Google"}
            </Button>
            <p className="text-xs text-white/60">Secure Google sign-in via backend redirect flow</p>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm uppercase tracking-[0.12em] text-white/70">OTP Login</h2>
            <Input placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
            <Input placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
            {!otpSent ? (
              <Button onClick={() => void requestOtp()}>Send OTP</Button>
            ) : (
              <div className="space-y-2">
                <Input placeholder="6-digit OTP" value={otp} onChange={(event) => setOtp(event.target.value)} />
                <Button onClick={() => void verifyOtp()}>Verify OTP</Button>
              </div>
            )}
          </Card>
        </>
      )}

      {status ? <p className="text-sm text-white/70">{status}</p> : null}
    </section>
  );
};
