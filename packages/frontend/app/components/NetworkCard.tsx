import { formatBytes } from "../lib/utils";

interface NetworkCardProps {
  iface: string | null;
  speed: { rx: number; tx: number } | null;
  delay?: number;
}

export default function NetworkCard({ iface, speed, delay = 0 }: NetworkCardProps) {
  return (
    <div
      className="bg-primary border border-secondary rounded-2xl p-6 animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-xs font-medium text-foreground-sec mb-4">
        Network
      </p>
      {iface && speed ? (
        <>
          <p className="text-xs font-medium text-foreground-sec mb-3">
            {iface}
          </p>
          <div className="flex gap-6">
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-medium text-blue">
                ↓ {formatBytes(speed.rx)}/s
              </span>
              <span className="text-[0.7rem] text-foreground-sec">
                Download
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-medium text-blue/70">
                ↑ {formatBytes(speed.tx)}/s
              </span>
              <span className="text-[0.7rem] text-foreground-sec">
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
