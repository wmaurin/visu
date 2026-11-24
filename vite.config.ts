import { defineConfig, type Plugin } from "vite";

/**
 * Content Security Policy for the built app. visu needs no network at all,
 * so `connect-src 'none'` keeps even injected code from sending diagrams
 * anywhere with fetch, XHR or WebSockets. Scripts and styles come only
 * from the app's own files. `frame-ancestors` has no effect in a meta tag
 * and GitHub Pages sets no headers, so it is left out.
 *
 * Only in builds: the dev server injects styles and talks to the browser
 * over a WebSocket for hot reload, which this policy would block.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
    ],
  };
}

export default defineConfig({
  // Relative asset paths, so the build works under any GitHub Pages path
  base: "./",
  plugins: [contentSecurityPolicy()],
});
