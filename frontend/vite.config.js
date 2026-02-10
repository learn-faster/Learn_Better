import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on mode
  const env = loadEnv(mode, process.cwd(), '')

  // Get backend URL from environment or use defaults
  const backendUrl = env.VITE_BACKEND_URL || env.BACKEND_URL || 'http://localhost:8001'
  const apiPort = env.VITE_API_PORT || env.API_PORT || '8001'
  const localBackend = `http://localhost:${apiPort}`

  // Use explicit backend URL if set, otherwise fallback to localhost
  const targetUrl = backendUrl || localBackend

  console.log(`[Vite Config] Backend target: ${targetUrl}`)

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "next/navigation": path.resolve(__dirname, "./src/test/next-navigation-mock.js"),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: targetUrl,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
        '/uploads': {
          target: targetUrl,
          changeOrigin: true,
          secure: false,
        }
      }
    },
    define: {
      // Make build-time env available to the app
      __BACKEND_URL__: JSON.stringify(targetUrl),
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      globals: true,
    }
  }
})
