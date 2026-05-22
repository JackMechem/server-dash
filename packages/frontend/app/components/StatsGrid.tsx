import { type Stats } from "../lib/getStats";
import StatCard from "./StatCard";

interface StatsGridProps {
  stats: Stats | null;
}

export default function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-11">
      <StatCard
        label="CPU"
        value={stats ? `${stats.cpu.percent.toFixed(1)}%` : "—"}
        sub={stats?.cpu.model.replace(/\(R\)/g, "").replace(/\(TM\)/g, "").trim()}
        percent={Number(stats?.cpu.percent.toFixed(1))}
        delay={0}
      />
      <StatCard
        label="Memory"
        value={stats ? `${(stats.memory.percent)}%` : "—"}
        sub={stats ? `${(stats.memory.used / 1000).toFixed(1)} GB / ${(stats.memory.total / 1000).toFixed(1)} GB` : ""}
        percent={stats?.memory.percent}
        delay={60}
      />
      <StatCard
        label="Disk"
        value={stats ? `${stats.disk.percent}%` : "—"}
        sub={stats ? `${(stats.disk.used / 1024).toFixed(1)} GB / ${(stats.disk.total / 1024).toFixed(0)} GB` : ""}
        percent={stats?.disk.percent}
        delay={120}
      />
      <StatCard
        label="Temperature"
        value={stats?.temperature != null ? `${stats.temperature}°C` : "—"}
        sub={
          stats?.temperature != null
            ? stats.temperature > 80
              ? "Running hot"
              : stats.temperature > 60
              ? "Warm"
              : "Cool"
            : ""
        }
        delay={180}
      />
    </div>
  );
}
