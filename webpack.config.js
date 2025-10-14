const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  mode: process.env.NODE_ENV || 'development',
  entry: {
    main: './src/webviews/index.tsx',
    welcome: './src/webviews/welcome.tsx',
    projectDashboard: './src/webviews/project-dashboard.tsx',
    configure: './src/webviews/configure.tsx'
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
            configFile: 'tsconfig.webview.json',
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
      '@/features': path.resolve(__dirname, 'src/features'),
      '@/shared': path.resolve(__dirname, 'src/shared'),
      '@/components': path.resolve(__dirname, 'src/webviews/components'),
      '@/hooks': path.resolve(__dirname, 'src/webviews/hooks'),
      '@/contexts': path.resolve(__dirname, 'src/webviews/contexts'),
      '@/screens': path.resolve(__dirname, 'src/webviews/screens'),
      '@/types': path.resolve(__dirname, 'src/webviews/types'),
      '@/utils': path.resolve(__dirname, 'src/webviews/utils')
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/webviews/index.html',
      filename: 'index.html'
    }),
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