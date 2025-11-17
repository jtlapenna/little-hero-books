// Polyfills for Cloudflare Workers environment
// React 19 SSR requires MessageChannel which is not available in Workers by default

if (typeof globalThis.MessageChannel === 'undefined') {
  // Simple MessageChannel polyfill for Cloudflare Workers
  class MessageChannelPolyfill {
    port1: MessagePortPolyfill;
    port2: MessagePortPolyfill;

    constructor() {
      const channel = this;
      
      class MessagePortPolyfill {
        _listeners: Set<(event: MessageEvent) => void> = new Set();
        _otherPort: MessagePortPolyfill | null = null;
        
        onmessage: ((event: MessageEvent) => void) | null = null;
        onmessageerror: ((event: MessageEvent) => void) | null = null;
        
        postMessage(message: any, transfer?: Transferable[]) {
          if (this._otherPort) {
            // Use setTimeout to simulate async message delivery
            setTimeout(() => {
              const event = new MessageEvent('message', {
                data: message,
              });
              if (this._otherPort?.onmessage) {
                this._otherPort.onmessage(event);
              }
              this._otherPort?._listeners.forEach(listener => {
                try {
                  listener(event);
                } catch (e) {
                  // Ignore errors
                }
              });
            }, 0);
          }
        }
        
        start() {
          // No-op for polyfill
        }
        
        close() {
          this._listeners.clear();
        }
        
        addEventListener(type: string, listener: (event: MessageEvent) => void) {
          if (type === 'message') {
            this._listeners.add(listener);
          }
        }
        
        removeEventListener(type: string, listener: (event: MessageEvent) => void) {
          if (type === 'message') {
            this._listeners.delete(listener);
          }
        }
        
        setOtherPort(port: MessagePortPolyfill) {
          this._otherPort = port;
        }
      }
      
      this.port1 = new MessagePortPolyfill();
      this.port2 = new MessagePortPolyfill();
      this.port1.setOtherPort(this.port2);
      this.port2.setOtherPort(this.port1);
    }
  }
  
  (globalThis as any).MessageChannel = MessageChannelPolyfill;
  
  if (typeof MessagePort === 'undefined') {
    (globalThis as any).MessagePort = MessagePortPolyfill as any;
  }
}

