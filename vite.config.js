import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// export default defineConfig({
//   plugins: [react()],
// })
import cesium from 'vite-plugin-cesium'

export default defineConfig({
  plugins: [react(), cesium()],
})
