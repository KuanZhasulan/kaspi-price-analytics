/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Rename to top-level `serverExternalPackages` when upgrading to Next.js 15
    serverComponentsExternalPackages: ['cheerio'],
  },
};

export default nextConfig;
