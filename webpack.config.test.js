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
      {
        test: /\.(js|jsx)$/,
        exclude: '/node_modules/',
        loader: 'babel-loader',
        options:{
          presets:['@babel/preset-react']
        }
      }
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