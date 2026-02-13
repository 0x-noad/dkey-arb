const CopyWebpackPlugin = require("copy-webpack-plugin");
const path = require('path');

module.exports = {
  entry: "./index.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "index.js",
    publicPath: "/",
  },
  devServer: {
    contentBase: path.resolve(__dirname, "dist"),
    publicPath: "/",
  },
  module: {
    rules: [
      {
        test: /\.(?:js|mjs|cjs)$/,
        exclude: /node_modules/,
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
    new CopyWebpackPlugin([
      { from: 'key.png', to: '.' },
      { from: 'index.html', to: '.' },
      { from: 'style.css', to: '.' },
      { from: path.join(__dirname, 'node_modules/dkey-lib/dist/dkey-lib.browser.js'), to: 'dkey-lib.browser.js' },
      { from: path.join(__dirname, 'node_modules/dkey-lib/circuits'), to: 'circuits' },
    ]),
  ],
};
