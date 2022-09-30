const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const path = require('path');
const Dotenv = require('dotenv-webpack');

module.exports = {
  mode: 'development',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.js',
	  publicPath: '/dist/'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js']
  },
  module: {
    rules: [ 
      {
        test: /\.tsx?$/,
        exclude: '/node_modules/',
        loader: 'ts-loader',
      },
      {
        test: /\.(js|jsx)$/,
        exclude: '/node_modules/',
        loader: 'babel-loader',
        options:{
          presets:['@babel/preset-react']
        }
      },
      {
        test: /\.module\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              modules: {
                localIdentName: '[local]_[sha1:hash:hex:7]'
              },
            }
          }
        ]
      },
      {
        test: /^((?!\.module).)*css$/,
        use: [ MiniCssExtractPlugin.loader, 'css-loader' ]
      }
    ]
  },

  plugins: [
    new Dotenv(),
    new MiniCssExtractPlugin({ filename: 'main.css' })
  ],

  devServer: {
    open: ['/index.html'],
    client: {
      overlay: true,
    },
    static: {
      directory: __dirname,
    },
  }
};