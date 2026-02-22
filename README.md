# DKEY App

Local-first, browser-based app for the [DKEY](https://dkey.app) protocol. A peer-to-peer marketplace where you can buy and sell decryption keys to files.

## Prerequisites

- **Node.js**
- **npm**

## Quick start

```bash
# Clone the repo
git clone https://github.com/0x-noad/dkey-arb.git dkeyapp
cd dkeyapp

# Install dependencies
npm install

# Build (output in dist/)
npm run build

# Run the dev server and open in browser
npm run start
```

## Usage

### Development

- **`npm run start`** — Runs the webpack dev server. Serves the app and rebuilds on file changes. Open the URL printed in the terminal (e.g. http://localhost:8080).
- **`npm run build`** — Builds once into the `dist/` folder. Use this before deploying or when you only want a static build.

### Production / static deploy

1. Run **`npm run build`**.
2. Serve the **`dist/`** directory with any static file server or upload `dist/` to IPFS
3. Open the site in a browser. The app works entirely in the client; connect a wallet to use DKEY features.

### In the app

- **Connect wallet** — Required for creating listings, bidding, reclaiming bids, and increasing bids.
- **Create listing** — Set file (IPFS), price, royalty, description; create listing and share the link.
- **View listing** — Open a listing by URL or from your profile; place a bid, increase, or reclaim.
- **Profile** — View your DKEYs, open bids, and profile JSON; use the links to view listings, increase or reclaim bids.

## Testing a fresh checkout

```bash
git clone https://github.com/0x-noad/dkey-arb.git test-dkeyapp
cd test-dkeyapp

npm install
npm run build
npm run start
```

Upon successful build, check if the app loads at http://localhost:8080

## For the full local-first experience...

1. run ipfs cli daemon, 
2. download freedom browser (https://freedombrowser.eth.limo/), 
3. paste `QmWXz5qiFDmdd5mKBD42VJ1jGDa1L6HdHmhb59VqYsPCXH` into freedom browser