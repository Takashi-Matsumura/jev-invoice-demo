import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mupdf は WASM を自前で読み込むので、バンドルせず Node からそのまま require させる
  serverExternalPackages: ["mupdf"],
};

export default nextConfig;
