/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The workspace packages ship TypeScript source rather than a build artifact,
  // so Next has to compile them itself. This is what lets `packages/core` stay
  // buildless — one less step between editing domain code and seeing it run.
  transpilePackages: ["@financemanager/core", "@financemanager/i18n"],
};

export default nextConfig;
