// Функции помощники


/** Определение меньшего из двух чисел */
export function min(a: number, b: number) { return a < b ? a : b }
/** Определение большего из двух чисел */
export function max(a: number, b: number) { return a > b ? a : b }
/** Представление числа со стартовым нулем */
export function dd(n: number): string { return (n<10 ? '0' : '') + n }
