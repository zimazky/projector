# Projector - Web Application for Event and Resource Planning

## Project Overview

Projector is a web application designed for planning events and managing resources. It is built using **React** with **TypeScript** for type safety and enhanced developer experience. **MobX** is employed for efficient state management across the application. The project uses **Webpack** for bundling, processing, and optimizing assets, including the use of **CSS Modules** for scoped styling.

The application structure appears to follow a feature-sliced design, organizing code into layers such as `app`, `pages`, `widgets`, `features`, `entities`, and `shared`.

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

*   **Testing:**
    The project uses Karma and Jasmine for testing. To run the tests, you would typically use the Karma CLI:
    ```bash
    karma start
    ```
    *(Note: This command is inferred from `devDependencies` and common Karma usage. If an npm script for testing exists, it would be preferred.)*

## Development Conventions

*   **Language:** TypeScript
*   **Frontend Framework:** React
*   **State Management:** MobX
*   **Bundler:** Webpack
*   **Styling:** CSS Modules (`.module.css` files)
*   **Code Structure:** Feature-sliced design, organizing components and logic by domain and layer (`1-app`, `3-pages`, `4-widgets`, `5-features`, `6-entities`, `7-shared`).
*   **Testing Frameworks:** Karma (test runner), Jasmine (behavior-driven development framework).
*   **Environment Variables:** Uses `dotenv-webpack` for managing environment variables.

This `GEMINI.md` file provides a comprehensive overview for anyone looking to understand, build, or contribute to the Projector application.
