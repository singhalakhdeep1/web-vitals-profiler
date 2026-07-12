import type { HTMLAttributes } from "react";
import { cn } from "./cn";

interface HeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle, className, ...props }: HeaderProps) {
  return (
    <header
      className={cn("border-b border-slate-200 bg-slate-50 px-4 py-3", className)}
      {...props}
    >
      <h1 className="text-base font-semibold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
    </header>
  );
}
