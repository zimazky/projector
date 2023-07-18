const path = require('path');
const Dotenv = require('dotenv-webpack');

module.exports = {
  mode: 'development',
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
    ]
  },

  plugins: [
    new Dotenv()
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