import { StatusDot } from "@/components/ui/status-dot";

interface ServicePillProps {
  name: string;
  status: string;
}

export default function ServicePill({ name, status }: ServicePillProps) {
  const active = status === "active";
  return (
    <div
      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm ${
        active
          ? "bg-green/10 border-green/20"
          : "bg-muted/30 border-border text-muted-foreground"
      }`}
    >
      <StatusDot status={active ? "online" : "offline"} size="md" />
      <span className="flex-1 font-normal">{name}</span>
      <span
        className={`text-[0.65rem] uppercase tracking-widest font-medium ${
          active ? "text-green" : "text-muted-foreground"
        }`}
      >
        {status}
      </span>
    </div>
  );
}
