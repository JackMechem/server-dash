"use client";

import { useEffect, useState, useRef } from "react";
import { getStats, type Stats, type NetworkInterface } from "./lib/getStats";

import NavBar from "./components/NavBar";
import Hero from "./components/Hero";
import StatsGrid from "./components/StatsGrid";
import ServicesCard from "./components/ServicesCard";
import UptimeCard from "./components/UptimeCard";
import NetworkCard from "./components/NetworkCard";
import LinksGrid from "./components/LinksGrid";

export default function Home() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [netSpeed, setNetSpeed] = useState<Record<string, { rx: number; tx: number }>>({});
    
    // We use Refs for these because changing them shouldn't trigger a "refresh"
    // but we need them to calculate the delta (speed) between fetches.
    const prevNetRef = useRef<Record<string, NetworkInterface> | null>(null);
    const lastFetchRef = useRef<number>(0);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const now = Date.now();
                const data = await getStats();

                // 1. Calculate speeds if we have previous data
                if (prevNetRef.current && lastFetchRef.current > 0) {
                    const elapsed = (now - lastFetchRef.current) / 1000;
                    const speeds: Record<string, { rx: number; tx: number }> = {};
                    
                    for (const iface of Object.keys(data.network)) {
                        const prev = prevNetRef.current[iface];
                        if (prev) {
                            speeds[iface] = {
                                rx: Math.max(0, (data.network[iface].rx - prev.rx) / elapsed),
                                tx: Math.max(0, (data.network[iface].tx - prev.tx) / elapsed),
                            };
                        }
                    }
                    setNetSpeed(speeds);
                }

                // 2. Update our "silent" trackers
                prevNetRef.current = data.network;
                lastFetchRef.current = now;

                // 3. Update the UI state with new data
                // React's Virtual DOM will only update the changed text/numbers.
                setStats(data);
            } catch (e) {
                console.error("Dashboard fetch failed:", e);
            }
        };

        // Initial fetch
        fetchData();

        // Start the 4s loop
        const id = setInterval(fetchData, 4000);

        // Clean up on unmount so we don't have multiple intervals running
        return () => clearInterval(id);
    }, []); // Empty array means this setup only happens ONCE.

    // Derived values for the UI
    const primaryIface = stats
        ? Object.keys(stats.network).find(
              (k) => !k.startsWith("docker") && !k.startsWith("br-") && stats.network[k].rx > 0
          )
        : null;

    const primarySpeed = primaryIface ? netSpeed[primaryIface] || null : null;

    return (
        <main className="max-w-5xl mx-auto px-6 pb-20">
            <NavBar online={!!stats} />
            <Hero lastUpdated={stats?.timestamp ?? null} />

            <div className="flex items-baseline justify-between mb-5">
                <h2 className="text-lg font-medium tracking-tight text-gray-900">
                    System Stats
                </h2>
            </div>
            
            <StatsGrid stats={stats} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-11">
                <ServicesCard services={stats?.services ?? null} delay={200} />
                <div className="flex flex-col gap-3.5">
                    <UptimeCard uptime={stats?.uptime ?? null} delay={250} />
                    <NetworkCard
                        iface={primaryIface ?? null}
                        speed={primarySpeed}
                        delay={300}
                    />
                </div>
            </div>

            <LinksGrid />
        </main>
    );
}
