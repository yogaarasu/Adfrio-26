import { Clock3 } from "lucide-react";
import { usePlayerStore } from "@/store/player-store";
import { Button } from "@/components/ui/button";

const options = [15, 30, 60];

export const SleepTimer = () => {
  const setSleepTimer = usePlayerStore((state) => state.setSleepTimer);
  const sleepUntil = usePlayerStore((state) => state.sleepUntil);

  return (
    <div className="flex items-center gap-2">
      <Clock3 className="h-4 w-4 text-white/70" />
      {options.map((min) => (
        <Button key={min} variant="outline" size="sm" onClick={() => setSleepTimer(min)}>
          {min}m
        </Button>
      ))}
      <Button variant="ghost" size="sm" onClick={() => setSleepTimer(null)}>
        Off
      </Button>
      {sleepUntil ? (
        <span className="text-xs text-white/60">Ends {new Date(sleepUntil).toLocaleTimeString()}</span>
      ) : null}
    </div>
  );
};

