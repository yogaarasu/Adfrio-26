import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-2xl border border-white/20 bg-gradient-to-b from-white/10 to-white/5 p-4 shadow-panel backdrop-blur",
      className
    )}
    {...props}
  />
);
