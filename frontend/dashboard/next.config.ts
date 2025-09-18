import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  distDir: 'out',
  assetPrefix: process.env.NODE_ENV === 'production' ? process.env.NEXTAUTH_URL : '',
};

export default nextConfig;
