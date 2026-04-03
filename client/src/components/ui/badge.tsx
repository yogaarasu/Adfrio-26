import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Badge = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("inline-flex items-center rounded-full border border-white/20 px-2 py-1 text-xs text-white/70", className)} {...props} />
);
