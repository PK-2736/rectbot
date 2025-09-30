/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use the static export output mode so the build produces an `out` directory
  output: 'export',
  // Keep default settings; adjust trailingSlash or basePath if your Pages deploy needs it
  // trailingSlash: true,
};

module.exports = nextConfig;
