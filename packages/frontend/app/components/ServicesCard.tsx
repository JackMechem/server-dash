import ServicePill from "./ServicePill";

interface ServicesCardProps {
  services: Record<string, string> | null;
  delay?: number;
}

export default function ServicesCard({ services, delay = 0 }: ServicesCardProps) {
  return (
    <div
      className="bg-primary border border-secondary rounded-2xl p-6 animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[0.68rem] font-medium tracking-widest uppercase text-foreground-sec mb-4">
        Services
      </p>
      <div className="flex flex-col gap-2">
        {services
          ? Object.entries(services).map(([name, status]) => (
              <ServicePill key={name} name={name} status={status} />
            ))
          : [1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-10" />
            ))}
      </div>
    </div>
  );
}
