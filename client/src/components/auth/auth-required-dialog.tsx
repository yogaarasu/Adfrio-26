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
      <Card className="relative w-full max-w-md space-y-5 border-0 bg-white p-6 text-neutral-900 shadow-none">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 rounded-lg text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
          onClick={hide}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
        <div>
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-neutral-600">{message}</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            className="rounded-xl bg-neutral-900 text-white hover:bg-neutral-800"
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
            className="rounded-xl border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
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
