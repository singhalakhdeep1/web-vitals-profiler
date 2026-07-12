import { cn } from "./cn";

interface StatusBadgeProps {
  label: string;
  status: "connected" | "disconnected" | "loading";
}

const statusStyles = {
  connected: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  disconnected: "bg-red-50 text-red-700 ring-red-600/20",
  loading: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

export function StatusBadge({ label, status }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        statusStyles[status],
      )}
    >
      {label}
    </span>
  );
}
