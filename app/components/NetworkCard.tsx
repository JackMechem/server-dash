import { formatBytes } from "../lib/utils";

interface NetworkCardProps {
  iface: string | null;
  speed: { rx: number; tx: number } | null;
  delay?: number;
}

export default function NetworkCard({ iface, speed, delay = 0 }: NetworkCardProps) {
  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[0.68rem] font-medium tracking-widest uppercase text-gray-400 mb-4">
        Network
      </p>
      {iface && speed ? (
        <>
          <p className="text-[0.68rem] font-medium tracking-widest uppercase text-gray-400 mb-3">
            {iface}
          </p>
          <div className="flex gap-6">
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-medium text-blue-500">
                ↓ {formatBytes(speed.rx)}/s
              </span>
              <span className="text-[0.62rem] uppercase tracking-widest text-gray-400">
                Download
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-medium text-violet-500">
                ↑ {formatBytes(speed.tx)}/s
              </span>
              <span className="text-[0.62rem] uppercase tracking-widest text-gray-400">
                Upload
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="skeleton h-11" />
      )}
    </div>
  );
}
