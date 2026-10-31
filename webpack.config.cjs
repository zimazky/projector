const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const path = require('path')
const Dotenv = require('dotenv-webpack')

module.exports = {
  mode: 'development',
  entry: './src/1-app/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.js',
    publicPath: '/dist/'
  },
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
        exclude: /node_modules/,
        loader: 'ts-loader'
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
              }
            }
          }
        ]
      },
      {
        test: /^((?!\.module).)*css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader']
      },
      {
        test: /\.m?js$/,
        enforce: 'pre',
        use: ['source-map-loader']
      }
    ]
  },
  performance: {
    hints: false,
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  },

  plugins: [
    new Dotenv({
      systemvars: true // брать переменные из process.env (в т.ч. GitHub Secrets)
    }),
    new MiniCssExtractPlugin({ filename: 'main.css' })
  ],

  devServer: {
    host: '127.0.0.1',
    port: process.env.PROJECTOR_DEV_PORT ? Number(process.env.PROJECTOR_DEV_PORT) : 8080,
    allowedHosts: 'auto',
    open: false,
    hot: true,
    client: {
      overlay: true
    },
    static: {
      directory: path.resolve(__dirname, 'dist/favicons'),
      publicPath: '/dist/favicons',
      watch: false
    },
    watchFiles: ['index.html'],
    setupMiddlewares: middlewares => {
      // Проверки Host/Origin остаются перед маршрутом индекса.
      middlewares.push({
        name: 'projector-index',
        middleware: (request, response, next) => {
          if (['GET', 'HEAD'].includes(request.method) && ['/', '/index.html'].includes(request.path)) {
            response.sendFile('index.html', { root: __dirname })
          } else {
            next()
          }
        }
      })
      return middlewares
    }
  }
}
