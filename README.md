[![Build and Deploy](https://github.com/zimazky/projector/actions/workflows/build.yml/badge.svg)](https://github.com/zimazky/projector/actions/workflows/build.yml)

# Projector

Веб-приложение для планирования событий (задач) и ресурсов.

Пример приложения по ссылке: https://zimazky.github.io/projector/

Окружение: Node.js **24.12.0**, npm **11.12.1**; установка — `npm ci`.
Запуск — `npm start`, затем открыть `http://127.0.0.1:8080/index.html`.
Для другого порта в PowerShell: `$env:PROJECTOR_DEV_PORT = '8081'` перед запуском.

Проверки: `npm run typecheck`, `npm run lint-check`, `npm test -- --runInBand`, `npm run build`.
Полный прогон с JSON-отчётами: `npm run verify:baseline`.
Проверки в настоящем браузере: `npm run browser:install`, затем `npm run test:e2e`.
Интерактивный запуск: `npm run test:e2e:ui`; отчёт: `npm run test:e2e:report`.
Сценарии и изоляция Google API описаны в [инструкции Playwright](docs/browser_testing_ru.md).
Чистая установка, воспроизводимые тесты и резервный снимок описаны в [отчёте этапа 0](docs/remediation_stage0_2026-10-31_ru.md).

Артефакт для GitHub Pages: `npm run build:pages`, результат — `artifacts/pages`.
Изменения сохранения и закрытия документов описаны в [отчёте этапа 1](docs/remediation_stage1_2026-10-31_ru.md).

Обновление зависимостей, проверки dev-server и оставшиеся advisory — в [отчёте этапа 2](docs/remediation_stage2_2026-10-31_ru.md).
