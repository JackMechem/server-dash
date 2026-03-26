interface NavBarProps {
  online: boolean;
}

export default function NavBar({ online }: NavBarProps) {
  return (
    <nav className="flex items-center justify-between pt-7 pb-6 mb-13 border-b border-gray-200">
      <div className="flex items-center gap-3">
        <span
          className="text-lg font-medium tracking-tight text-gray-900"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
           Jack&apos;s Servers
        </span>
      </div>

      <div
        className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border ${
          online
            ? "text-green-700 bg-green-50 border-green-200"
            : "text-gray-500 bg-gray-50 border-gray-200"
        }`}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: online ? "#22c55e" : "#d1d5db",
            animation: online ? "pulse-dot 2s infinite" : "none",
          }}
        />
        {online ? "Online" : "Connecting..."}
      </div>
    </nav>
  );
}
