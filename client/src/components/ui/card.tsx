import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-2xl border border-border bg-gradient-to-b from-card via-card to-muted/50 p-4 shadow-panel backdrop-blur",
      className
    )}
    {...props}
  />
);
