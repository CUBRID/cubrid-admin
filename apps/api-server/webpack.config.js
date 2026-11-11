const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { DefinePlugin, IgnorePlugin } = require('webpack');
const { join } = require('path');
// A build script of this repository, not a project module: the version is read at build time.
// eslint-disable-next-line @nx/enforce-module-boundaries
const { productVersion } = require('../../scripts/product-version.cjs');

// Every dependency is bundled into main.js, so the server runs without a
// node_modules folder (desktop resources/api-server, the server executables).
//
// NestJS loads these optional packages only when their feature is used
// (microservices, websockets, cache); they are not installed, so the bundle
// leaves them out. file-type is ESM-only and only loaded by Nest's
// FileTypeValidator, which this server does not use.
const OPTIONAL_PACKAGES = [
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module',
  '@nestjs/websockets',
  '@nestjs/websockets/socket-module',
  'cache-manager',
  'class-transformer/storage',
];
const NOT_USED = ['file-type'];

function isInstalled(request) {
  try {
    require.resolve(request, { paths: [__dirname] });
    return true;
  } catch {
    return false;
  }
}

// The minimal package.json next to main.js (nothing to install).
class WritePackageJsonPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('WritePackageJsonPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'WritePackageJsonPlugin', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL },
        () => {
          const manifest = { name: 'api-server', version: '0.0.1', private: true, main: 'main.js' };
          compilation.emitAsset('package.json', new compiler.webpack.sources.RawSource(JSON.stringify(manifest, null, 2) + '\n'));
        }
      );
    });
  }
}

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
      generatePackageJson: false,
      externalDependencies: 'none',
      sourceMap: true,
    }),
    new IgnorePlugin({
      checkResource: (request) => NOT_USED.includes(request) || (OPTIONAL_PACKAGES.includes(request) && !isInstalled(request)),
    }),
    new WritePackageJsonPlugin(),
    // Bakes the product version, major.minor.patch.commit_num (see
    // scripts/product-version.cjs), into the bundle at build time, so there's
    // no runtime dependency on a package.json file being present next to
    // main.js in every deployment shape (plain node, the single executable,
    // bundled inside the Electron app).
    new DefinePlugin({
      'process.env.APP_VERSION': JSON.stringify(productVersion().version),
    }),
  ],
  ignoreWarnings: [
    // Packages that ship source maps pointing at sources they do not publish.
    /Failed to parse source map/,
    // Optional loaders that require a name held in a variable: Nest's
    // load-package/load-adapter/optional-require (every call used here passes
    // a static loader), Express view engines (no views here) and load-esm
    // (file-type, left out above).
    {
      module: /node_modules[\\/](@nestjs[\\/](common|core)|express|load-esm)[\\/]/,
      message: /Critical dependency: the request of a dependency is an expression/,
    },
  ],
};
