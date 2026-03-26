import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    allowedDevOrigins: ['dashboard.jackmechem.dev'],
    output: 'standalone',
};

export default nextConfig;
