// Vite plugin to inject MessageChannel polyfill for Cloudflare Workers
import type { Plugin } from 'vite';

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

export function cloudflarePolyfillPlugin(): Plugin {
  return {
    name: 'cloudflare-polyfill',
    renderChunk(code, chunk, options) {
      // Inject polyfill into ALL SSR chunks (format: 'es') unconditionally
      // This ensures MessageChannel is available before React SSR code runs
      // Cloudflare Workers don't have MessageChannel, so this is required
      // The polyfill must be at the very top of the chunk, before any React code
      if (options.format === 'es') {
        // Only inject once per chunk - check if already present
        if (!code.includes('MessageChannel polyfill')) {
          // Inject at the absolute top of the chunk
          return {
            code: MESSAGECHANNEL_POLYFILL.trim() + '\n\n' + code,
            map: null
          };
        }
      }
      return null;
    }
  };
}

