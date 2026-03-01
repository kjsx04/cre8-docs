/** @type {import('next').NextConfig} */
const nextConfig = {
  // Include template .docx files in Vercel serverless function bundle
  experimental: {
    outputFileTracingIncludes: {
      "/api/docs/generate": ["./src/templates/tokenized/**/*"],
    },
  },
};

export default nextConfig;
