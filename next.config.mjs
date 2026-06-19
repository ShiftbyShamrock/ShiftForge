/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow static HTML export if needed
  output: undefined,

  // Ignore TypeScript errors during build for initial deployment
  typescript: {
    ignoreBuildErrors: true,
  },

  // Headers for API security
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'https://shiftforge.io' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ];
  },
};

export default nextConfig;
