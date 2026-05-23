import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 匹配所有以 /api/nvidia 开头的请求
      '/api/nvidia': {
        target: 'https://integrate.api.nvidia.com',
        changeOrigin: true,
        // 将 /api/nvidia 替换为空，这样实际请求的就是 https://integrate.api.nvidia.com/v1/chat/completions
        rewrite: (path) => path.replace(/^\/api\/nvidia/, '')
      }
    }
  }
})