const path = require('path');
const webpack = require('webpack');

module.exports = {
  mode: process.env.NODE_ENV || 'development',
  entry: {
    wizard: './webview-ui/src/wizard/index.tsx',
    welcome: './webview-ui/src/welcome/index.tsx',
    dashboard: './webview-ui/src/dashboard/index.tsx',
    configure: './webview-ui/src/configure/index.tsx'
  },
  output: {
    path: path.resolve(__dirname, 'dist', 'webview'),
    filename: '[name]-bundle.js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'webview-ui/tsconfig.json',
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
      // Extension host aliases (for feature UI code that imports from extension)
      '@/features': path.resolve(__dirname, 'src/features'),
      '@/shared': path.resolve(__dirname, 'src/shared'),
      '@/types': path.resolve(__dirname, 'src/types'),
      // Webview UI aliases (new structure)
      '@/webview-ui': path.resolve(__dirname, 'webview-ui/src'),
      '@/design-system': path.resolve(__dirname, 'webview-ui/src/shared/components'),
      // Legacy aliases for backward compatibility (remove after full migration)
      '@/components': path.resolve(__dirname, 'webview-ui/src/shared/components'),
      '@/hooks': path.resolve(__dirname, 'webview-ui/src/shared/hooks'),
      '@/contexts': path.resolve(__dirname, 'webview-ui/src/shared/contexts'),
      '@/utils': path.resolve(__dirname, 'webview-ui/src/shared/utils')
    }
  },
  plugins: [
    // Define process.env for browser environment
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
      'process.env': JSON.stringify({ NODE_ENV: process.env.NODE_ENV || 'production' })
    })
  ],
  devtool: process.env.NODE_ENV === 'production' ? false : 'source-map',
  performance: {
    hints: false
  }
};