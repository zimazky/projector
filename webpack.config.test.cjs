const path = require('path')
const Dotenv = require('dotenv-webpack')

module.exports = {
  mode: 'development',
  resolve: {
    alias: {
      src: path.resolve(__dirname, 'src')
    },
    extensions: ['.ts', '.tsx', '.js'],
    fallback: {
      crypto: false,
      stream: false,
      util: false,
      path: false,
      fs: false
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: '/node_modules/',
        loader: 'ts-loader',
        options: {
          transpileOnly: true
        }
      }
    ]
  },

  plugins: [new Dotenv()],

  devServer: {
    open: ['/index.html'],
    client: {
      overlay: true
    },
    static: {
      directory: __dirname
    }
  }
}
