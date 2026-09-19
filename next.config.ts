import type { NextConfig } from "next";

// /api/py/* is served by the FastAPI function (api/index.py).
// In dev, proxy it to a local uvicorn on :8000. On Vercel, vercel.json rewrites it to the Python function.
const nextConfig: NextConfig = {
  rewrites: async () =>
    process.env.NODE_ENV === "development"
      ? [{ source: "/api/py/:path*", destination: "http://127.0.0.1:8000/api/py/:path*" }]
      : [],
};

export default nextConfig;
