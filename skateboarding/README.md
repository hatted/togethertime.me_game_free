# setup nodejs

## setup npm

Run:

```sh
git clone <your-repo-url>
cd skateboarding
npm ci
npm run dev
```

## setup npm packages

Run:

```sh
npm install some-package
git add package.json package-lock.json
```

## How to deploy

Run:

```sh
npm install
npm run build
```

Upload the contents of dist/ (not the project root, and not node_modules) to any static host. The host only has to serve those files over HTTP or HTTPS. WebGL needs a real URL, so the site has to be served, not opened as a file.

Examples:

• nginx. Point the site root at the uploaded folder:

```conf
server {
    listen 80;
    server_name example.com;
    root /var/www/shred-street;
    index index.html;
}
```

- A static host such as GitHub Pages, Netlify, or Cloudflare Pages. Set the build command to npm run build and the publish directory to dist.
- A quick check of the production build on your own machine: npm run preview. That is still local. It is not the process you leave running on the server.

vite.config.js does not set a base path, so the built files expect to live at the domain root (https://example.com/). If the game will sit in a subfolder such as https://example.com/skate/, set base: '/skate/' in vite.config.js and build again.
