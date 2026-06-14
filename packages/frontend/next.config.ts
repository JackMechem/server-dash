import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	allowedDevOrigins: ["dashboard.jackmechem.dev", "test.jackmechem.dev", "localhost", "192.168.0.55"],
	output: "standalone",
};

export default nextConfig;
