const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { DefinePlugin } = require('webpack');
const { join } = require('path');
const { productVersion } = require('../../scripts/product-version.cjs');

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
    // Bakes the product version, major.minor.patch.commit_num (see
    // scripts/product-version.cjs), into the bundle at build time, so there's
    // no runtime dependency on a package.json file being present next to
    // main.js in every deployment shape (plain node, pkg executable,
    // bundled inside the Electron app).
    new DefinePlugin({
      'process.env.APP_VERSION': JSON.stringify(productVersion().version),
    }),
  ],
};
