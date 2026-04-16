import type { RealtimeTimelineState } from "@/hooks/use-realtime-timeline";

type Props = {
  timeline: RealtimeTimelineState;
  label: string;
};

const formatClock = (ts: number): string =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const RealtimeTimeline = ({ timeline, label }: Props) => {
  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-cyan-900 dark:text-cyan-100">
      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-200/80">
        <span>{label}</span>
        <span>{Math.round(timeline.percent)}%</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-cyan-950/10 dark:bg-black/40">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-300 transition-[width] duration-500 ease-out"
          style={{ width: `${timeline.percent}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-cyan-800/80 dark:text-cyan-100/70">
        <span>Start: {formatClock(timeline.startedAt)}</span>
        <span>{timeline.finishedAt ? `End: ${formatClock(timeline.finishedAt)}` : "Running..."}</span>
      </div>

      <p className="mt-1 line-clamp-2 text-xs text-cyan-900/90 dark:text-cyan-100/85">{timeline.message}</p>
    </div>
  );
};
