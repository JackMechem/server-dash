import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	allowedDevOrigins: ["dashboard.jackmechem.dev", "test.jackmechem.dev", "localhost"],
	output: "standalone",
};

export default nextConfig;
