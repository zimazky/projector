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

/**
 * Представление числа в кило-единицах
 * @param d - число
 * @param n - точность округления, по умолчанию 0
 * @returns 
 */
export function kilo(d: number, n: number = 0): string { return (d/1000).toFixed(n) }

/**
 * Функция-утилита для троттлинга.
 * Ограничивает частоту вызовов функции: функция будет вызвана не чаще, чем раз в 'limit' миллисекунд.
 * @param func - функция для троттлинга
 * @param limit - минимальный интервал между вызовами функции в миллисекундах
 * @returns обернутая функция, вызовы которой будут троттлиться
 */
export function throttle<T extends (...args: any[]) => void>(func: T, limit: number): T {
  let inThrottle: boolean;
  let lastResult: any;
  let lastArgs: any[] | null;
  let lastThis: any | null;

  return function(this: any, ...args: any[]): any {
    lastArgs = args;
    lastThis = this;
    if (!inThrottle) {
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs && lastThis) { // If it was called again during the throttle period
            lastResult = func.apply(lastThis, lastArgs);
            lastArgs = null;
            lastThis = null;
        }
      }, limit);
      lastResult = func.apply(this, args);
    }
    return lastResult;
  } as T;
}

