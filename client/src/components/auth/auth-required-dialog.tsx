import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuthGateStore } from "@/store/auth-gate-store";

export const AuthRequiredDialog = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { open, title, message, hide } = useAuthGateStore();

  const returnTo = useMemo(() => {
    const path = `${location.pathname}${location.search}${location.hash}`;
    return path.startsWith("/") ? path : "/home";
  }, [location.hash, location.pathname, location.search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close sign in prompt"
        onClick={hide}
      />
      <Card className="relative w-full max-w-md space-y-5 rounded-3xl border border-border/85 bg-card p-6 text-foreground shadow-panel">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 rounded-lg text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          onClick={hide}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
        <div>
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            className="rounded-xl"
            onClick={() => {
              hide();
              navigate(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
            }}
          >
            Sign In
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-border/90 bg-card/80 text-foreground hover:bg-muted/70"
            onClick={() => {
              hide();
              navigate(`/sign-up?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
            }}
          >
            Sign Up
          </Button>
        </div>
      </Card>
    </div>
  );
};
