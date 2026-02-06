// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  server: { port: 4323 },
  output: 'server',
  adapter: cloudflare({
    mode: 'pages',
  }),
  session: {
    driver: 'cookie'
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()]
  }
});