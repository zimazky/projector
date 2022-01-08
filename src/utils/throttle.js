// Функция-обертка для пропусков частых вызовов, ограничение задается переменной ms в милисекундах
export default function throttle(fn, ms = 200) {
  let isThrottled = false, lastArgs, lastThis
  function wrapper() {
    if(isThrottled) {
      lastArgs = arguments
      lastThis = this
      return
    }
    fn.apply(this,arguments)
    isThrottled = true
    setTimeout(()=>{
      isThrottled=false
      if(lastArgs) {
        wrapper.apply(lastThis,lastArgs)
        lastArgs = lastThis = null
      }
    },ms)
  }
  return wrapper
}
