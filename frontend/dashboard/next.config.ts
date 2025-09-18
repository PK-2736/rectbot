import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  distDir: 'out',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // assetPrefix: process.env.NODE_ENV === 'production' ? process.env.NEXT_PUBLIC_DASHBOARD_URL : '',
};

export default nextConfig;
