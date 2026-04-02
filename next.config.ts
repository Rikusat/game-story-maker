import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  webpack: (config) => {
    config.cache = false;
    return config;
  },
  outputFileTracingIncludes: {
    '/api/novel/generate': ['./prompts/**/*'],
  },
};

export default nextConfig;
