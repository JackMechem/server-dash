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
          ? "bg-green-50 border-green-200"
          : "bg-gray-50 border-gray-200 text-gray-400"
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          active ? "bg-green-500" : "bg-gray-300"
        }`}
      />
      <span className="flex-1 font-normal">{name}</span>
      <span
        className={`text-[0.65rem] uppercase tracking-widest font-medium ${
          active ? "text-green-600" : "text-gray-400"
        }`}
      >
        {status}
      </span>
    </div>
  );
}
