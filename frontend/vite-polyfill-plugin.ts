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
      // Inject polyfill into all SSR chunks (format: 'es') that might use React
      // This includes renderer chunks and worker entry files
      if (options.format === 'es') {
        // Check if this chunk contains React/renderer code or is a worker entry
        const hasReactRenderer = 
          chunk.isEntry || // Entry chunks need the polyfill
          chunk.fileName.includes('renderers') ||
          chunk.fileName.includes('_worker') ||
          chunk.fileName.includes('astro') ||
          (chunk.moduleIds && chunk.moduleIds.some(id => 
            id.includes('@astrojs') || 
            id.includes('react-dom') || 
            id.includes('renderers')
          )) ||
          code.includes('react-dom/server') ||
          code.includes('requireReactDomServer') ||
          code.includes('requireServer_browser');
        
        if (hasReactRenderer) {
          // Only inject once per chunk - check if already present
          if (!code.includes('MessageChannel polyfill')) {
            return {
              code: MESSAGECHANNEL_POLYFILL + '\n' + code,
              map: null
            };
          }
        }
      }
      return null;
    }
  };
}

