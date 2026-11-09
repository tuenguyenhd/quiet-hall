import { defineConfig, type ProxyOptions } from 'vite';

const rpcProxy = (target: string): ProxyOptions => ({
  target,
  changeOrigin: true,
  rewrite: () => '/',
  configure: (proxy) =>
    (proxy as unknown as { on(e: string, f: (req: { removeHeader(h: string): void }) => void): void }).on('proxyReq', (req) => {
      for (const h of ['cf-worker', 'cf-connecting-ip', 'cf-ray', 'x-forwarded-for', 'origin']) req.removeHeader(h);
    }),
});

// Dev: Vite serves the app on :5173 (also on your Wi-Fi IP for phone testing)
// and proxies the live-hall WebSocket + API to `wrangler dev` on :8787.
export default defineConfig({
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': { target: 'http://127.0.0.1:8787', ws: true },
      '/api': 'http://127.0.0.1:8787',
      // Local only: the Worker reaches Solana's public RPC through here, because the public RPC
      // refuses requests from Cloudflare Workers (they always carry a "cf-worker" header).
      '/rpc/devnet': rpcProxy('https://api.devnet.solana.com'),
      '/rpc/mainnet': rpcProxy('https://api.mainnet-beta.solana.com'),
    },
  },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
