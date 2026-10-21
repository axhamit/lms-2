/** @type {import('next').NextConfig} */
module.exports = {
  output: 'standalone',        // small production Docker image
  poweredByHeader: false,
  reactStrictMode: false,      // strict mode runs effects twice in dev, which would start the video room twice
};
