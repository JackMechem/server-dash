import { execSync } from "child_process";
import fs from "fs";
import { NextResponse } from "next/server";

function readFile(path: string): string | null {
  try {
    return fs.readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}

function exec(cmd: string): string | null {
  try {
    return execSync(cmd, { timeout: 3000 }).toString().trim();
  } catch {
    return null;
  }
}

function getMemory() {
  const raw = readFile("/proc/meminfo");
  if (!raw) return null;
  const lines: Record<string, number> = {};
  for (const line of raw.split("\n")) {
    const [key, val] = line.split(":");
    if (key && val) {
      lines[key.trim()] = parseInt(val.trim());
    }
  }
  const total = lines["MemTotal"] ?? 0;
  const available = lines["MemAvailable"] ?? 0;
  const used = total - available;
  return {
    total: Math.round(total / 1024),
    used: Math.round(used / 1024),
    available: Math.round(available / 1024),
    percent: Math.round((used / total) * 100),
  };
}

function getCpu() {
  // Take two samples 100ms apart to calculate usage
  const sample = () => {
    const raw = readFile("/proc/stat");
    if (!raw) return null;
    const line = raw.split("\n")[0];
    const parts = line.split(/\s+/).slice(1).map(Number);
    const idle = parts[3];
    const total = parts.reduce((a, b) => a + b, 0);
    return { idle, total };
  };

  const s1 = sample();
  execSync("sleep 0.2");
  const s2 = sample();

  if (!s1 || !s2) return null;

  const idleDiff = s2.idle - s1.idle;
  const totalDiff = s2.total - s1.total;
  const percent = Math.round((1 - idleDiff / totalDiff) * 100);

  const model =
    exec("grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2") ??
    "Unknown";
  const cores =
    exec("grep -c '^processor' /proc/cpuinfo") ?? "?";

  return {
    percent,
    model: model.trim(),
    cores: parseInt(cores),
  };
}

function getTemperature() {
  // Try common thermal zone paths
  const paths = [
    "/sys/class/thermal/thermal_zone0/temp",
    "/sys/class/thermal/thermal_zone1/temp",
    "/sys/class/hwmon/hwmon0/temp1_input",
  ];
  for (const path of paths) {
    const raw = readFile(path);
    if (raw) {
      return Math.round(parseInt(raw) / 1000);
    }
  }
  // Try sensors command as fallback
  const sensors = exec("sensors 2>/dev/null | grep 'Core 0' | head -1");
  if (sensors) {
    const match = sensors.match(/\+(\d+\.\d+)/);
    if (match) return parseFloat(match[1]);
  }
  return null;
}

function getDisk() {
  const raw = exec("df -B1 /");
  if (!raw) return null;
  const lines = raw.split("\n");
  const parts = lines[1].split(/\s+/);
  const total = parseInt(parts[1]);
  const used = parseInt(parts[2]);
  const available = parseInt(parts[3]);
  return {
    total: Math.round(total / 1024 / 1024 / 1024),
    used: Math.round(used / 1024 / 1024 / 1024),
    available: Math.round(available / 1024 / 1024 / 1024),
    percent: Math.round((used / total) * 100),
  };
}

function getUptime() {
  const raw = readFile("/proc/uptime");
  if (!raw) return null;
  const seconds = parseFloat(raw.split(" ")[0]);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return { seconds, days, hours, minutes };
}

function getNetwork() {
  const raw = readFile("/proc/net/dev");
  if (!raw) return null;
  const ifaces: Record<string, { rx: number; tx: number }> = {};
  for (const line of raw.split("\n").slice(2)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 10) continue;
    const name = parts[0].replace(":", "");
    if (name === "lo") continue;
    ifaces[name] = {
      rx: parseInt(parts[1]),
      tx: parseInt(parts[9]),
    };
  }
  return ifaces;
}

function getServices() {
  const services = ["caddy", "syncthing", "sshd", "cloudflare-dyndns"];
  const result: Record<string, string> = {};
  for (const svc of services) {
    result[svc] = exec(`systemctl is-active ${svc}`) ?? "unknown";
  }
  return result;
}

function getLoadAverage() {
  const raw = readFile("/proc/loadavg");
  if (!raw) return null;
  const parts = raw.split(" ");
  return {
    "1m": parseFloat(parts[0]),
    "5m": parseFloat(parts[1]),
    "15m": parseFloat(parts[2]),
  };
}

export async function GET() {
  const [memory, cpu, disk, uptime, network, services, loadAvg, temperature] =
    await Promise.all([
      getMemory(),
      getCpu(),
      getDisk(),
      getUptime(),
      getNetwork(),
      getServices(),
      getLoadAverage(),
      getTemperature(),
    ]);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    memory,
    cpu,
    disk,
    uptime,
    network,
    services,
    loadAvg,
    temperature,
  });
}
