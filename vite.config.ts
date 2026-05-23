import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createProxyMiddleware } from 'http-proxy-middleware'
import type { IncomingMessage, ServerResponse } from 'node:http'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'dynamic-cors-proxy',
      configureServer(server) {
        /**
         * All AI API requests are routed through /api-proxy/<slug>/<path...>
         * The real upstream base URL is passed via the X-Proxy-Target header.
         * Since this runs in Node.js (server-side), there is no browser CORS restriction.
         */
        server.middlewares.use(
          '/api-proxy',
          (req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const target = req.headers['x-proxy-target'] as string | undefined
            if (!target) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Missing X-Proxy-Target header' }))
              return
            }

            // Strip /api-proxy/<slug> prefix — keep only the real API path
            // e.g. /api-proxy/openai/v1/chat/completions → /v1/chat/completions
            const originalUrl = req.url ?? '/'
            const withoutSlug = originalUrl.replace(/^\/[^/]*/, '') || '/'
            req.url = withoutSlug

            // Remove custom header before forwarding
            delete req.headers['x-proxy-target']

            createProxyMiddleware<IncomingMessage, ServerResponse>({
              target,
              changeOrigin: true,
              secure: true,
              on: {
                error(err: Error) {
                  console.error('[cors-proxy] upstream error:', err.message)
                  if (!res.headersSent) {
                    res.writeHead(502, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ error: err.message }))
                  }
                },
              },
            })(req, res, next)
          }
        )
      },
    },
  ],
})
