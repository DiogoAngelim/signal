# Landing Site

This folder contains the public homepage for Signal.

## What It Is

The landing site is the public front door for the project. It should stay short, clear, and aligned with the protocol-first story used in the docs.

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

- the docs introduction
- the envelope reference
- the quickstart
- the reference implementation

## What To Avoid

- marketing language that outgrows the protocol
- claims that sound broader than the contract
- coupling the homepage to implementation details
