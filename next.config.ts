const withNextIntl = require('next-intl/plugin')();
 
/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};
 
module.exports = withNextIntl(nextConfig);
