import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-full text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-50",
        variant === "default" && "bg-white text-black hover:bg-zinc-200",
        variant === "outline" && "border border-white/30 bg-transparent text-white hover:bg-white/10",
        variant === "ghost" && "bg-transparent text-white hover:bg-white/10",
        size === "default" && "h-10 px-5 py-2",
        size === "sm" && "h-8 px-3",
        size === "icon" && "h-10 w-10",
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
