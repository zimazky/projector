# Анализ и рекомендации по библиотекам иконок

## Текущее состояние

В проекте используются самописные SVG-иконки, расположенные в `src/7-shared/ui/Icons/Icons.tsx`. 

### Преимущества текущего подхода:
- **Полный контроль** над внешним видом и поведением иконок
- **Многоцветные иконки** — возможность использовать разные цвета для разных частей (например, Google логотип с 4 цветами, Weather с оранжевым солнцем и серой тулчей)
- **Минимальный размер бандла** — только те иконки, которые реально используются
- **Гибкость компоновки** — иконки можно комбинировать (Google + DownloadSign, Google + UploadSign)

### Недостатки:
- **Ограниченный набор** — всего около 10 иконок
- **Затраты времени** на создание новых иконок
- **Отсутствие стандартизации** — нет единого стиля

## Современные библиотеки иконок с поддержкой многоцветности

### 1. Iconify ⭐ Рекомендуется

**Сайт:** https://iconify.design/

**Описание:** Универсальный фреймворк для работы с иконками, объединяющий 200+ наборов иконок (Material Design, Font Awesome, Tabler, Fluent, Carbon, и многие другие).

**Преимущества:**
- **Огромный выбор** — более 200,000 иконок из 200+ наборов
- **Многоцветные иконки** — поддержка полноцветных иконок (emoji, бренды, флаги, погодные иконки)
- **Единый API** — одинаковый способ использования для всех наборов
- **Tree-shaking** — в бандл попадают только используемые иконки
- **CSS-кастомизация** — можно менять цвет одноцветных иконок через CSS
- **React-компоненты** — официальная поддержка React (`@iconify/react`)

**Пример использования:**

```tsx
import { Icon } from '@iconify/react';
import googleFill from '@iconify/icons-logos/google-icon';
import weatherSunny from '@iconify/icons-mdi/weather-sunny';
import contentSave from '@iconify/icons-mdi/content-save';

// Многоцветные брендовые иконки
<Icon icon="logos:google-icon" width={24} />

// Одноцветные с возможностью смены цвета
<Icon icon="mdi:content-save" color="#4CAF50" width={24} />

// Погодные иконки (многоцветные)
<Icon icon="wi:day-sunny" width={24} />
```

**Установка:**
```bash
npm install @iconify/react
```

**Наборы с многоцветными иконками:**
- `logos` — брендовые логотипы (Google, Facebook, GitHub и др.)
- `wi` (Weather Icons) — погодные иконки
- `twemoji` — Twitter Emoji
- `noto` — Google Noto Emoji
- `fluent-emoji` — Microsoft Fluent Emoji
- `circle-flags` — флаги стран

---

### 2. Tabler Icons

**Сайт:** https://tabler-icons.io/

**Описание:** Набор из 5000+ SVG-иконок в едином стиле.

**Преимущества:**
- **Современный минималистичный стиль**
- **React-компоненты** из коробки
- **Stroke-based** — тонкие линии, легко настраиваемые
- **Размер stroke** можно менять глобально

**Недостатки:**
- **Только одноцветные** — нет встроенной поддержки многоцветности
- **Нет брендовых иконок**

**Пример использования:**
```tsx
import { IconDeviceFloppy, IconDownload, IconUpload } from '@tabler/icons-react';

<IconDeviceFloppy size={24} color="currentColor" stroke={1.5} />
```

**Установка:**
```bash
npm install @tabler/icons-react
```

---

### 3. Lucide Icons

**Сайт:** https://lucide.dev/

**Описание:** Форк Feather Icons с активной поддержкой и расширенным набором (1000+ иконок).

**Преимущества:**
- **Простота и элегантность**
- **Отличная поддержка React**
- **Легковесность**
- **Активное сообщество**

**Недостатки:**
- **Только одноцветные**
- **Нет брендовых иконок**

**Пример использования:**
```tsx
import { Save, Download, Upload, Cloud } from 'lucide-react';

<Save size={24} color="currentColor" />
```

**Установка:**
```bash
npm install lucide-react
```

---

### 4. React Icons

**Сайт:** https://react-icons.github.io/react-icons/

**Описание:** Агрегатор популярных наборов иконок (Font Awesome, Material Design, Bootstrap Icons, и др.) в виде React-компонентов.

**Преимущества:**
- **Много наборов в одном пакете** — FA, MDI, Bootstrap, Feather, Ionicons, и др.
- **Простой импорт**
- **Tree-shaking**

**Недостатки:**
- **Ограниченная поддержка многоцветности** — большинство иконок одноцветные
- **Большой размер пакета** при использовании многих наборов

**Пример использования:**
```tsx
import { FaGoogle, FaSave } from 'react-icons/fa';
import { MdWeatherSunny } from 'react-icons/md';

<FaGoogle size={24} />
<FaSave size={24} color="currentColor" />
```

**Установка:**
```bash
npm install react-icons
```

---

### 5. Phosphor Icons

**Сайт:** https://phosphoricons.com/

**Описание:** Гибкий набор иконок с 6 весами (thin, light, regular, bold, fill, duotone).

**Преимущества:**
- **Duotone-версия** — двухцветные иконки с основным и акцентным цветом
- **6 вариантов толщины**
- **Единый согласованный стиль**
- **Отличная React-поддержка**

**Недостатки:**
- **Duotone — это 2 цвета**, не полноцветные
- **Нет брендовых иконок**

**Пример использования:**
```tsx
import { FloppyDisk, CloudArrowDown, CloudArrowUp } from '@phosphor-icons/react';

// Duotone с кастомными цветами
<FloppyDisk size={24} weight="duotone" color="#4CAF50" />
<CloudArrowDown size={24} weight="duotone" />
```

**Установка:**
```bash
npm install @phosphor-icons/react
```

---

## Сравнительная таблица

| Библиотека | Кол-во иконок | Многоцветность | Бренды | React | Tree-shaking |
|------------|---------------|----------------|--------|-------|--------------|
| **Iconify** | 200,000+ | ✅ Полноцветные | ✅ | ✅ | ✅ |
| Tabler Icons | 5,000+ | ❌ | ❌ | ✅ | ✅ |
| Lucide | 1,000+ | ❌ | ❌ | ✅ | ✅ |
| React Icons | 10,000+ | ⚠️ Ограничено | ✅ | ✅ | ✅ |
| Phosphor | 1,000+ | ⚠️ Duotone (2 цв.) | ❌ | ✅ | ✅ |

---

## Рекомендация

### Основной выбор: **Iconify** (@iconify/react)

Iconify — лучший выбор для вашего проекта по следующим причинам:

1. **Многоцветные иконки** — брендовые логотипы (Google, GitHub), погодные иконки, emoji
2. **Максимальный выбор** — можно найти иконку практически для любой задачи
3. **Гибкость** — можно комбинировать иконки из разных наборов
4. **Современный подход** — один API для всех наборов
5. **Легковесность** — tree-shaking обеспечивает минимальный размер бандла

### Стратегия миграции

Рекомендуется **гибридный подход**:

1. **Сохранить текущие иконки** для уникальных случаев (например, ModifiedAsterisk)
2. **Заменить простые иконки** на Iconify-аналоги (Menu, Diskette, Fullscreen)
3. **Использовать Iconify для новых иконок**

### Примеры замены текущих иконок

```tsx
// Было:
import { Diskette, DownloadSign, UploadSign, Weather, Google } from 'src/7-shared/ui/Icons/Icons'

// Станет:
import { Icon } from '@iconify/react'

// Diskette → mdi:content-save или mdi:content-save-all
<Icon icon="mdi:content-save" width={24} />

// Weather → wi:day-cloudy или wi:day-sunny
<Icon icon="wi:day-cloudy" width={24} />

// Google (многоцветный!) → logos:google-icon
<Icon icon="logos:google-icon" width={24} />

// Download → mdi:download
<Icon icon="mdi:download" width={24} />

// Upload → mdi:upload
<Icon icon="mdi:upload" width={24} />

// Fullscreen → mdi:fullscreen или mdi:arrow-expand
<Icon icon="mdi:fullscreen" width={24} />
```

### Пример компонента-обёртки для совместимости

```tsx
// src/7-shared/ui/Icons/AppIcon.tsx
import React from 'react'
import { Icon, IconifyIcon } from '@iconify/react'

type AppIconProps = {
  icon: IconifyIcon | string
  size?: number
  color?: string
  className?: string
}

const AppIcon: React.FC<AppIconProps> = ({ 
  icon, 
  size = 24, 
  color = 'currentColor',
  className 
}) => {
  return (
    <Icon 
      icon={icon} 
      width={size} 
      height={size} 
      color={color}
      className={className}
    />
  )
}

export default AppIcon
```

### Компоновка иконок (как в текущей реализации)

Для сохранения возможности комбинировать иконки (Google + UploadSign):

```tsx
import { Icon } from '@iconify/react'
import React from 'react'

type SwgIconProps = {
  children: React.ReactNode
}

// Сохраняем существующую обёртку
const SwgIcon: React.FC<SwgIconProps> = ({ children }) => {
  return (
    <svg focusable="false" viewBox="0 0 24 24" style={{ width: 24, height: 24 }}>
      {children}
    </svg>
  )
}

// Компоновка
<SwgIcon>
  <Icon icon="logos:google-icon" width={16} />
  <Icon icon="mdi:upload" width={10} x={14} y={14} />
</SwgIcon>
```

Или более современный подход с абсолютным позиционированием:

```tsx
import { Icon } from '@iconify/react'

const CombinedIcon: React.FC = () => (
  <span style={{ position: 'relative', display: 'inline-block', width: 24, height: 24 }}>
    <Icon icon="logos:google-icon" width={24} />
    <Icon 
      icon="mdi:upload" 
      width={12} 
      style={{ position: 'absolute', right: -2, bottom: -2 }}
    />
  </span>
)
```

---

## План внедрения

1. **Установить Iconify:**
   ```bash
   npm install @iconify/react
   ```

2. **Создать файл с константами иконок:**
   ```tsx
   // src/7-shared/ui/Icons/iconNames.ts
   export const ICONS = {
     save: 'mdi:content-save',
     saveAll: 'mdi:content-save-all',
     download: 'mdi:download',
     upload: 'mdi:upload',
     menu: 'mdi:menu',
     fullscreen: 'mdi:fullscreen',
     google: 'logos:google-icon',
     weather: 'wi:day-cloudy',
     weatherSunny: 'wi:day-sunny',
     // ... другие
   } as const
   ```

3. **Постепенно заменить иконки в компонентах**

4. **Удалить неиспользуемые самописные иконки**

---

## Итог

**Iconify** — оптимальное решение для расширения набора иконок с сохранением возможности использовать многоцветные варианты. Это современный, активно развивающийся проект с огромным сообществом, который станет стандартом работы с иконками в ближайшие годы.

Сочетание Iconify с сохранением вашего подхода к компоновке иконок даст максимальную гибкость при минимальных затратах времени.
