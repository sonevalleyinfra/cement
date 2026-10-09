import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone: a minimal server + only the files it needs.
  // The Dockerfile copies just that into the final image.
  output: "standalone",
};

export default nextConfig;
