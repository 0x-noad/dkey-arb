const CopyWebpackPlugin = require("copy-webpack-plugin");
const path = require('path');

module.exports = {
  entry: "./index.js",
  resolve: {
    alias: {
      "@wagmi/connectors": path.join(__dirname, "node_modules/@wagmi/connectors/dist/esm/walletConnect.js"),
    },
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "index.js",
    publicPath: "./",
  },
  devServer: {
    static: { directory: path.resolve(__dirname, "dist") },
    devMiddleware: { publicPath: "/" },
  },
  module: {
    rules: [
      {
        test: /\.(?:js|mjs|cjs)$/,
        exclude: /node_modules[\\/](dkey-lib|copy-webpack-plugin|webpack|babel-loader|@babel[\\/])/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', { targets: "defaults" }]
            ]
          }
        }
      }
    ]
  },
  mode: "development",
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'key.png', to: '.' },
        { from: 'arbitrum-logo.png', to: '.' },
        { from: 'index.html', to: '.' },
        { from: 'style.css', to: '.' },
        { from: path.join(__dirname, 'node_modules/dkey-lib/dist/dkey-lib.browser.js'), to: 'dkey-lib.browser.js' },
        { from: path.join(__dirname, 'node_modules/dkey-lib/circuits'), to: 'circuits' },
        { from: path.join(__dirname, 'node_modules/snarkjs/build/snarkjs.min.js'), to: 'snarkjs.min.js' },
      ],
    }),
  ],
};
