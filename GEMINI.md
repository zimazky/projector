# Projector - Web Application for Event and Resource Planning

## Project Overview

Projector is a web application designed for planning events and managing resources. It is built using **React** with **TypeScript** for type safety and enhanced developer experience. **MobX** is employed for efficient state management across the application. The project uses **Webpack** for bundling, processing, and optimizing assets, including the use of **CSS Modules** for scoped styling.

The application structure appears to follow a feature-sliced design, organizing code into layers such as `app`, `pages`, `widgets`, `features`, `entities`, and `shared`.

## Documentation

Project documentation is located in the `docs` folder. All documentation must be written in Russian.

## Building and Running

The project includes several npm scripts to facilitate development, building, and serving the application.

*   **Start Development Server:**
    To start the development server with live reloading and open the application in your browser, run:
    ```bash
    npm start
    ```
    This command executes `webpack serve --mode development`, typically accessible at `http://localhost:8080/index.html` or a similar address.

*   **Development Build:**
    To create a development build of the application in the `dist/` directory, run:
    ```bash
    npm run dev
    ```
    This command executes `webpack --mode development`.

*   **Production Build:**
    To create an optimized production build of the application in the `dist/` directory, run:
    ```bash
    npm run build
    ```
    This command executes `webpack --mode production`.

*   **Тесты:**
    Юнит-тесты выполняются в Jest с jsdom:
    ```bash
    npm test -- --runInBand
    ```
    Браузерные проверки выполняются через Playwright: `npm run browser:install`, затем `npm run test:e2e`. Инструкция: [docs/browser_testing_ru.md](docs/browser_testing_ru.md).
    Karma и Jasmine удалены. Требуемое окружение: Node.js 24.12.0 и npm 11.12.1.

## Development Conventions

*   **Language:** TypeScript
*   **Frontend Framework:** React
*   **State Management:** MobX
*   **Bundler:** Webpack
*   **Styling:** CSS Modules (`.module.css` files)
*   **Code Structure:** Feature-Sliced Design (FSD) - the project MUST adhere to this architecture, organizing components and logic by domain and layer (`1-app`, `3-pages`, `4-widgets`, `5-features`, `6-entities`, `7-shared`).
*   **Тестовый стек:** Jest, ts-jest, jest-environment-jsdom; Playwright для браузерных сценариев.
*   **Environment Variables:** Uses `dotenv-webpack` for managing environment variables.
*   **Code Documentation:** When generating code, types and functions must be thoroughly documented with comments in Russian.

This `GEMINI.md` file provides a comprehensive overview for anyone looking to understand, build, or contribute to the Projector application.
