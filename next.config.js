/** @type {import('next').NextConfig} */
const nextConfig = {
    // Enable React strict mode
    reactStrictMode: true,
    // Enable app directory
    experimental: {
        appDir: true,
    },
    // Configure static image imports
    images: {
        disableStaticImages: false,
    },
    webpack(config) {
        config.module.rules.push({
            test: /\.(png|jpg|gif|svg)$/i,
            type: 'asset/resource'
        });
        return config;
    }
};

module.exports = nextConfig;
