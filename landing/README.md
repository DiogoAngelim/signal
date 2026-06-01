# Landing Site

This folder contains the public homepage for Signal.

## What It Is

The landing site is the public front door for the project. It should start with
the current understanding, then reveal reasoning and evidence only when they
make the situation clearer.

## Run Locally

```bash
pnpm --filter @signal/landing dev
```

## Build

```bash
pnpm --filter @signal/landing build
```

The site is configured for static export and GitHub Pages.

## What It Should Link To

- What Is Signal?
- the Quick Start
- Build Your First App
- the API reference
- the reference implementation

## What To Avoid

- marketing language that outgrows the protocol
- claims that sound broader than the contract
- coupling the homepage to implementation details
- metric-first or dashboard-first explanations
