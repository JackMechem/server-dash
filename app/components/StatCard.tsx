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
      className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-1 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="text-[0.68rem] font-medium tracking-widest uppercase text-gray-400">
        {label}
      </span>
      <span className="text-3xl font-medium tracking-tight text-gray-900 leading-none mt-1">
        {value}
      </span>
      {sub && (
        <span className="text-[0.7rem] text-gray-400 mt-0.5 truncate">{sub}</span>
      )}
      {percent !== undefined && (
        <div className="h-[3px] bg-gray-100 rounded-full mt-3 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
      )}
    </div>
  );
}
