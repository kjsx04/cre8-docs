/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the app to be embedded in an iframe on cre8advisors.com
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "ALLOW-FROM https://cre8advisors.com",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://cre8advisors.com https://*.webflow.io",
          },
        ],
      },
    ];
  },
  // Include template .docx files in Vercel serverless function bundle
  experimental: {
    outputFileTracingIncludes: {
      "/api/docs/generate": ["./src/templates/tokenized/**/*"],
    },
  },
};

export default nextConfig;
