import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: false
    }),
    prerender: {
      entries: [
        '/',
        '/login',
        '/dashboard'
        // Add other routes as needed
      ],
      handleHttpError: ({ path, referrer, message }) => {
        // Log prerendering errors
        console.warn(`Failed to prerender ${path}${referrer ? ` (referred from ${referrer})` : ''}: ${message}`);
        
        // Fail gracefully for specific routes if needed
        if (path.startsWith('/some-dynamic-route/')) {
          return;
        }
        
        // Throw error for other routes
        throw new Error(message);
      }
    }
  },
  preprocess: vitePreprocess()
};

export default config;