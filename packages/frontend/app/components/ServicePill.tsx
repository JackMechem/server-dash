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
          : "bg-secondary/30 border-secondary text-foreground-sec"
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          active ? "bg-green" : "bg-foreground-sec/40"
        }`}
      />
      <span className="flex-1 font-normal">{name}</span>
      <span
        className={`text-[0.65rem] uppercase tracking-widest font-medium ${
          active ? "text-green" : "text-foreground-sec"
        }`}
      >
        {status}
      </span>
    </div>
  );
}
