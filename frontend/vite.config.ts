import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))
// Shared contract types are owned jointly and live beside frontend/ (../integration/api-types.ts).
const integrationDir = path.resolve(here, '../integration')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@contract': integrationDir },
  },
  server: {
    // The backend's default CORS allowlist is localhost/127.0.0.1 on port 5173 (backend README).
    // strictPort stops Vite from silently moving to 5174 and breaking CORS.
    port: 5173,
    strictPort: true,
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), integrationDir] },
  },
  preview: { port: 5173, strictPort: true },
})
