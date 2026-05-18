// Jest setup provided by Grafana scaffolding
import './.config/jest-setup';

// Polyfill for TextEncoder/TextDecoder in Node.js environment
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Polyfill for IntersectionObserver
class MockIntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.IntersectionObserver = MockIntersectionObserver;

// jsdom does not implement HTMLCanvasElement.getContext; @grafana/ui's
// measureText helper (used by Combobox) calls ctx.measureText and crashes
// otherwise. Stub the 2D context with the bare minimum API used in tests.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      measureText: (text) => ({ width: (text?.length ?? 0) * 8 }),
      font: '',
    };
  };
}
