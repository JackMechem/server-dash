import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import { NextResponse } from "next/server";

const execAsync = promisify(exec);

/**
 * Helper to read files asynchronously
 */
async function readFile(path: string): Promise<string | null> {
  try {
    const data = await fs.readFile(path, "utf8");
    return data.trim();
  } catch {
    return null;
  }
}

/**
 * Helper to run shell commands asynchronously
 */
async function runCommand(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(cmd, { timeout: 3000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function getMemory() {
  const raw = await readFile("/proc/meminfo");
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

async function getCpu() {
  const sample = async () => {
    const raw = await readFile("/proc/stat");
    if (!raw) return null;
    const line = raw.split("\n")[0];
    const parts = line.split(/\s+/).slice(1).map(Number);
    const idle = parts[3];
    const total = parts.reduce((a, b) => a + b, 0);
    return { idle, total };
  };

  const s1 = await sample();
  // Non-blocking delay (200ms) to calculate CPU delta
  await new Promise((resolve) => setTimeout(resolve, 200));
  const s2 = await sample();

  if (!s1 || !s2) return null;

  const idleDiff = s2.idle - s1.idle;
  const totalDiff = s2.total - s1.total;
  const percent = Math.round((1 - idleDiff / totalDiff) * 100);

  // Parse CPU Info without spawning extra shell processes
  const cpuInfo = (await readFile("/proc/cpuinfo")) || "";
  const model = cpuInfo.match(/model name\s+:\s+(.*)/)?.[1] || "Unknown";
  const cores = cpuInfo.split("\n").filter((l) => l.startsWith("processor")).length;

  return {
    percent,
    model: model.trim(),
    cores,
  };
}

async function getTemperature() {
  const paths = [
    "/sys/class/thermal/thermal_zone0/temp",
    "/sys/class/thermal/thermal_zone1/temp",
    "/sys/class/hwmon/hwmon0/temp1_input",
  ];
  for (const path of paths) {
    const raw = await readFile(path);
    if (raw) return Math.round(parseInt(raw) / 1000);
  }
  
  const sensors = await runCommand("sensors 2>/dev/null | grep 'Core 0' | head -1");
  if (sensors) {
    const match = sensors.match(/\+(\d+\.\d+)/);
    if (match) return parseFloat(match[1]);
  }
  return null;
}

async function getDisk() {
  const raw = await runCommand("df -B1 /");
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

async function getUptime() {
  const raw = await readFile("/proc/uptime");
  if (!raw) return null;
  const seconds = parseFloat(raw.split(" ")[0]);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return { seconds, days, hours, minutes };
}

async function getNetwork() {
  const raw = await readFile("/proc/net/dev");
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

async function getServices() {
  const services = ["caddy", "syncthing", "sshd", "cloudflare-dyndns"];
  const result: Record<string, string> = {};
  
  // Run all status checks in parallel
  await Promise.all(
    services.map(async (svc) => {
      const status = await runCommand(`systemctl is-active ${svc}`);
      result[svc] = status ?? "unknown";
    })
  );
  
  return result;
}

async function getLoadAverage() {
  const raw = await readFile("/proc/loadavg");
  if (!raw) return null;
  const parts = raw.split(" ");
  return {
    "1m": parseFloat(parts[0]),
    "5m": parseFloat(parts[1]),
    "15m": parseFloat(parts[2]),
  };
}

export async function GET() {
  try {
    // Parallelize all data gathering
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
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
