// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflarePolyfillPlugin } from './vite-polyfill-plugin.js';

const MESSAGECHANNEL_POLYFILL = `
// MessageChannel polyfill for Cloudflare Workers
if (typeof globalThis.MessageChannel === 'undefined') {
  class MessageChannelPolyfill {
    constructor() {
      class MessagePortPolyfill {
        _listeners = new Set();
        _otherPort = null;
        onmessage = null;
        onmessageerror = null;
        
        postMessage(message, transfer) {
          if (this._otherPort) {
            setTimeout(() => {
              const event = new MessageEvent('message', { data: message });
              if (this._otherPort?.onmessage) {
                this._otherPort.onmessage(event);
              }
              this._otherPort?._listeners.forEach(listener => {
                try { listener(event); } catch (e) {}
              });
            }, 0);
          }
        }
        
        start() {}
        close() { this._listeners.clear(); }
        addEventListener(type, listener) {
          if (type === 'message') this._listeners.add(listener);
        }
        removeEventListener(type, listener) {
          if (type === 'message') this._listeners.delete(listener);
        }
        setOtherPort(port) { this._otherPort = port; }
      }
      
      this.port1 = new MessagePortPolyfill();
      this.port2 = new MessagePortPolyfill();
      this.port1.setOtherPort(this.port2);
      this.port2.setOtherPort(this.port1);
    }
  }
  
  globalThis.MessageChannel = MessageChannelPolyfill;
}
`;

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    mode: 'pages',
  }),
  integrations: [react()],
  vite: {
    plugins: [
      tailwindcss(),
      cloudflarePolyfillPlugin()
    ],
    resolve: {
      alias: {
        "@": new URL("./src", import.meta.url).pathname
      }
    },
    ssr: {
      optimizeDeps: {
        include: ['react', 'react-dom']
      },
      resolve: {
        conditions: ['worker', 'import']
      }
    },
    define: {
      global: 'globalThis'
    }
  }
});