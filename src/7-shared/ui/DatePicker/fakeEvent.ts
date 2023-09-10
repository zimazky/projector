
export function fakeEvent<T>(target: EventTarget & T, type: string): React.FormEvent<T> {
  return {
    currentTarget: target,
    target: target,
    bubbles: true,
    cancelable: false,
    defaultPrevented: false,
    eventPhase: 3,
    isTrusted: true,
    preventDefault: ()=>{},
    isDefaultPrevented: ()=>false,
    stopPropagation: ()=>{},
    isPropagationStopped: ()=>false,
    persist: ()=>{},
    timeStamp: 0,
    type: type,
    nativeEvent: {
      currentTarget: null,
      target: target,
      bubbles: true,
      cancelBubble: false,
      cancelable: false,
      composed: false,
      defaultPrevented: false,
      eventPhase: 0,
      isTrusted: true,
      returnValue: true,
      srcElement: target,
      timeStamp: 0,
      type: type,
      composedPath: ()=>[],
      initEvent: ()=>{},
      preventDefault: ()=>{},
      stopImmediatePropagation: ()=>{},
      stopPropagation: ()=>{},
      NONE: 0,
      CAPTURING_PHASE: 1,
      AT_TARGET: 2,
      BUBBLING_PHASE: 3
    }
  }
}


