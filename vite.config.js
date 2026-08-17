import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const CONTENT_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.html': 'text/html' };

// Serve data/items/ at /items/ in dev — not included in production build
function devItemsMiddleware() {
	return {
		name: 'dev-items',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use('/items', (req, res, next) => {
				const filePath = path.join(process.cwd(), 'data/items', req.url ?? '');
				if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
					res.setHeader('Content-Type', CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream');
					fs.createReadStream(filePath).pipe(res);
				} else {
					next();
				}
			});
		}
	};
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devItemsMiddleware()],
	server: {
		watch: {
			// The dev preview's approve toggle writes here at runtime; without this,
			// Vite sees the change and triggers a full page reload, resetting the
			// preview UI back to its default year/index.
			ignored: ['**/data/approvals.json']
		}
	}
});
