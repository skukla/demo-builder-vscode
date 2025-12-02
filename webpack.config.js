const path = require('path');
const webpack = require('webpack');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

module.exports = {
  mode: process.env.NODE_ENV || 'development',
  entry: {
    // Feature-based entry points (new architecture)
    wizard: './src/features/project-creation/ui/wizard/index.tsx',
    dashboard: './src/features/dashboard/ui/index.tsx',
    configure: './src/features/dashboard/ui/configure/index.tsx',
    sidebar: './src/features/sidebar/ui/index.tsx',
    // Projects list home screen (card grid view)
    projectsList: './src/features/projects-dashboard/ui/index.tsx'
  },
  output: {
    path: path.resolve(__dirname, 'dist', 'webview'),
    filename: '[name]-bundle.js',
    chunkFilename: '[name].js', // Separate naming for code-split chunks
    clean: true
  },
  optimization: {
    // Code splitting configuration
    splitChunks: {
      cacheGroups: {
        // Extract React, ReactDOM, and Adobe Spectrum to vendors bundle
        vendors: {
          test: /[\\/]node_modules[\\/](react|react-dom|@adobe\/react-spectrum)/,
          name: 'vendors',
          chunks: 'all',
          priority: 20
        },
        // Extract common code shared between features
        common: {
          minChunks: 2,
          name: 'common',
          chunks: 'all',
          priority: 10,
          reuseExistingChunk: true
        }
      }
    },
    // Extract webpack runtime to separate bundle
    runtimeChunk: {
      name: 'runtime'
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.json',
            transpileOnly: true
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource'
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    alias: {
      // Feature-based architecture aliases
      '@/features': path.resolve(__dirname, 'src/features'),
      '@/core': path.resolve(__dirname, 'src/core'),
      '@/types': path.resolve(__dirname, 'src/types')
    }
  },
  plugins: [
    // Provide process global for browser (polyfill for Node.js process object)
    // Note: process.env.NODE_ENV is automatically defined by webpack's 'mode' option
    new webpack.ProvidePlugin({
      process: 'process/browser'
    }),
    // Bundle analyzer (only when ANALYZE=true environment variable set)
    ...(process.env.ANALYZE ? [new BundleAnalyzerPlugin()] : [])
  ],
  devtool: process.env.NODE_ENV === 'production' ? false : 'source-map',
  performance: {
    hints: false
  }
};