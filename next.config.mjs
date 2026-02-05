/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ['firebase-admin', 'firebase-functions'],
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    {
                        "key": "Cross-Origin-Opener-Policy",
                        "value": "same-origin-allow-popups",
                    },
                    {
                        "key": "Cross-Origin-Embedder-Policy",
                        "value": "unsafe-none",
                    }
                ],
            },
        ];
    },
};

export default nextConfig;
