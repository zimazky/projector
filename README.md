[![Build and Deploy](https://github.com/zimazky/projector/actions/workflows/build.yml/badge.svg)](https://github.com/zimazky/projector/actions/workflows/build.yml)

# Projector

Веб-приложение для планирования событий (задач) и ресурсов.

Пример приложения по ссылке: https://zimazky.github.io/projector/

Проверки: `npm run typecheck`, `npm run lint-check`, `npm test -- --runInBand`, `npm run build`.
Полный прогон с JSON-отчётами: `npm run verify:baseline`.
Чистая установка, воспроизводимые тесты и резервный снимок описаны в [отчёте этапа 0](docs/remediation_stage0_2026-10-31_ru.md).

Артефакт для GitHub Pages: `npm run build:pages`, результат — `artifacts/pages`.
Изменения сохранения и закрытия документов описаны в [отчёте этапа 1](docs/remediation_stage1_2026-10-31_ru.md).
