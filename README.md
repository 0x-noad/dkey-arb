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

### Production / static deploy

1. Run **`npm run build`**.
2. Serve the **`dist/`** directory with any static file server or upload `dist/` to IPFS
3. Open the site in a browser. The app works entirely in the client.

## For the full local-first experience...

1. run ipfs cli daemon,

    ```bash
    # Install Kubo (IPFS CLI) — macOS
    brew install kubo

    # Allow the app (dev server on 8080) to talk to your node
    ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://127.0.0.1:8080", "http://localhost:8080"]'
    ipfs config --json Gateway.HTTPHeaders.Access-Control-Allow-Origin '["http://127.0.0.1:8080", "http://localhost:8080"]'

    # Start the daemon
    ipfs daemon
    ```

2. download & open freedom browser (https://freedombrowser.eth.limo/), 
3. paste `QmUg15vD8huJHqBjgjHQmywAfJkVaMNPd7CXTY37XnpHfx` into the freedom browser URL bar, and hit Enter!