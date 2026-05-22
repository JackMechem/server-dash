import { statColor } from "../lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  percent?: number;
  delay?: number;
}

export default function StatCard({ label, value, sub, percent, delay = 0 }: StatCardProps) {
  const pct = percent ?? 0;
  const color = statColor(pct);

  return (
    <div
      className="bg-primary border border-secondary rounded-2xl p-5 flex flex-col gap-1 hover:-translate-y-0.5 transition-all duration-200 animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="text-xs font-medium text-foreground-sec">
        {label}
      </span>
      <span className="text-3xl font-medium tracking-tight text-foreground leading-none mt-1">
        {value}
      </span>
      {sub && (
        <span className="text-[0.7rem] text-foreground-sec mt-0.5 truncate">{sub}</span>
      )}
      {percent !== undefined && (
        <div className="h-[3px] bg-secondary rounded-full mt-3 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
      )}
    </div>
  );
}
