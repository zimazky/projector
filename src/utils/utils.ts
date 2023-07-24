// Функции помощники


/** Определение меньшего из двух чисел */
export function min(a: number, b: number) { return a < b ? a : b }
/** Определение большего из двух чисел */
export function max(a: number, b: number) { return a > b ? a : b }

/**
 * Представление числа со стартовым знаком '+' при положительных значениях
 * @param d - число
 * @param n - точность округления, по умолчанию 0
 * @returns 
 */
export function plus(d: number, n: number = 0): string {
  return d > 0 ? '+' + d.toFixed(n) : d.toFixed(n)
}