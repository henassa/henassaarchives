/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // 90 = qualité des couvertures (le défaut de Next, 75, compresse trop)
    qualities: [75, 90],
    formats: ["image/webp"],
  },
};

export default nextConfig;
