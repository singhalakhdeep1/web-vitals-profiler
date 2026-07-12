import { getRatingColorClass } from "@wvp/utils";
import { cn } from "./cn";

interface MetricRowProps {
  name: string;
  value: string;
  rating?: "good" | "needs-improvement" | "poor";
}

export function MetricRow({ name, value, rating }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="font-medium text-slate-700">{name}</span>
      <span className={cn("font-mono tabular-nums", rating && getRatingColorClass(rating))}>
        {value}
      </span>
    </div>
  );
}
