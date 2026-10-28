const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { DefinePlugin } = require('webpack');
const { join } = require('path');
const { version } = require('../../package.json');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/api-server'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMap: true,
    }),
    // Bakes the root package.json's version (the single release-version
    // source of truth, shared with the Electron desktop packaging — see
    // scripts/sync-version.mjs) into the bundle at build time, so there's
    // no runtime dependency on a package.json file being present next to
    // main.js in every deployment shape (plain node, pkg executable,
    // bundled inside the Electron app).
    new DefinePlugin({
      'process.env.APP_VERSION': JSON.stringify(version),
    }),
  ],
};
