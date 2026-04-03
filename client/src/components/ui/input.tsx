import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-xl border border-white/20 bg-black/40 px-4 text-sm text-white outline-none placeholder:text-white/50 focus:border-white",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
