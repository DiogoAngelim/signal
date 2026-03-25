# Landing Site

This folder contains the marketing site for Signal.

## Run Locally

```bash
cd landing
npm install
npm run dev
```

The site runs with the Next.js dev server.

## Build For GitHub Pages

```bash
cd landing
npm run build
```

This creates a static export in `landing/out`.

## Deploy To GitHub Pages

1. Push your changes to the `main` branch.
2. In GitHub, open the repository settings.
3. Go to `Pages`.
4. Set `Build and deployment` to `GitHub Actions`.
5. Wait for the `Deploy Landing to GitHub Pages` workflow to finish.

After deployment, the site will be available at:

`https://DiogoAngelim.github.io/signal/`

## Notes

- The Pages workflow builds only the `landing/` app.
- The site is exported statically, so it does not need a Node.js server.
- If you ever move this to a user site or custom domain, update `basePath` in `landing/next.config.ts`.
