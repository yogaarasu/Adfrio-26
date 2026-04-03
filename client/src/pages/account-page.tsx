import { useEffect, useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authApi } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

export const AccountPage = () => {
  const { user, setSession, logout } = useAuthStore();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("adfrio_token");
    if (!token) return;

    authApi
      .me()
      .then(({ data }) => {
        setSession(token, data.user);
      })
      .catch(() => {
        logout();
      });
  }, [logout, setSession]);

  const googleLogin = useGoogleLogin({
    flow: "auth-code",
    scope: "openid email profile",
    ux_mode: "popup",
    onSuccess: async (codeResponse) => {
      try {
        setGoogleLoading(true);
        const { data } = await authApi.googleAuthCode(codeResponse.code);
        setSession(data.token, data.user);
        setStatus("Signed in with Google");
      } catch {
        setStatus("Google authorization failed");
      } finally {
        setGoogleLoading(false);
      }
    },
    onError: () => {
      setStatus("Google sign-in failed");
      setGoogleLoading(false);
    }
  });

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

  return (
    <section className="mx-auto max-w-lg space-y-4">
      <h1 className="text-3xl font-bold uppercase tracking-[0.18em]">Account</h1>

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
            <Button onClick={() => googleLogin()} disabled={googleLoading}>
              {googleLoading ? "Connecting..." : "Continue with Google"}
            </Button>
            <p className="text-xs text-white/60">Authorization Code flow (server-side token exchange)</p>
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
