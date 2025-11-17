import { defineConfig } from 'vite'

// Force modern target so top-level await and newer syntax are allowed during build.
export default defineConfig({
  build: {
    target: 'esnext'
  }
})
