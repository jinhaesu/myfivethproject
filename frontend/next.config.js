/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '') || 'http://localhost:4000';

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: `${BACKEND_URL}/uploads/:path*`,
      },
    ];
  },
  webpack: (config) => {
    // pdfjs-dist는 server-side에서 canvas를 optionally require — alias로 무시
    config.resolve.alias.canvas = false;
    return config;
  },
};
module.exports = nextConfig;
