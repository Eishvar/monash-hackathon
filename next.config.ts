import type { NextConfig } from "next";

// /api/py/* is served by the FastAPI function (api/index.py).
// In dev, proxy it to a local uvicorn on :8000; on Vercel it routes to the Python function.
const nextConfig: NextConfig = {
  rewrites: async () => [
    {
      source: "/api/py/:path*",
      destination:
        process.env.NODE_ENV === "development"
          ? "http://127.0.0.1:8000/api/py/:path*"
          : "/api/",
    },
  ],
};

export default nextConfig;
