import { pad } from "../lib/utils";
import { type Uptime } from "../lib/getStats";

interface UptimeCardProps {
  uptime: Uptime | null;
  delay?: number;
}

export default function UptimeCard({ uptime, delay = 0 }: UptimeCardProps) {
  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[0.68rem] font-medium tracking-widest uppercase text-gray-400 mb-4">
        Uptime
      </p>
      {uptime ? (
        <div className="flex">
          {[
            { val: uptime.days, unit: "days" },
            { val: uptime.hours, unit: "hrs" },
            { val: uptime.minutes, unit: "min" },
          ].map(({ val, unit }, i) => (
            <div
              key={unit}
              className={`flex flex-col items-center flex-1 ${
                i < 2 ? "border-r border-gray-200" : ""
              }`}
            >
              <span className="text-3xl font-medium tracking-tight text-gray-900 leading-none">
                {pad(val)}
              </span>
              <span className="text-[0.62rem] uppercase tracking-widest text-gray-400 mt-1.5">
                {unit}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="skeleton h-12" />
      )}
    </div>
  );
}
