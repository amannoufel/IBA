/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'iba-jcek29c4m-amannoufels-projects.vercel.app']
    }
  }
}

module.exports = nextConfig