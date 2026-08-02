import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'TradeEdge',
        short_name: 'TradeEdge',
        description: 'Indian stock market analytics workspace',
        theme_color: '#091321',
        background_color: '#091321',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      includeAssets: ['icon-192.png', 'icon-512.png', 'tradeedge_logo.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallbackDenylist: [
          /^\/(?:robots\.txt|sitemap\.xml|ads\.txt|site\.webmanifest|manifest\.webmanifest|favicon\.svg|tradeedge_logo\.png|tradeedge-favicon\.svg|icon-192\.png|icon-512\.png)$/,
          /^\/(?:sw\.js|workbox-.*\.js)$/
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 }
            }
          }
        ]
      }
    })
  ],
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          if (id.includes('ForumModule')) return 'forum';
          if (id.includes('WatchlistDashboard')) return 'watchlist';
          if (id.includes('StockDashboard')) return 'stock-dashboard';
          if (id.includes('PremiumTickerDashboard')) return 'premium-ticker';
        },
      },
    },
  },
})
