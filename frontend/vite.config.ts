import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import monacoEditorPluginModule from 'vite-plugin-monaco-editor'

const monacoEditorPlugin = (monacoEditorPluginModule as any).default || monacoEditorPluginModule

export default defineConfig({
  plugins: [react(), monacoEditorPlugin({ publicPath: '/' })],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8899'
    }
  }
})
