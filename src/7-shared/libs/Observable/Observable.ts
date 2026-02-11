// src/7-shared/libs/Observable/Observable.ts
type Listener<T> = (event: T) => void;

class Observable<T> {
  private listeners: Listener<T>[] = [];

  subscribe(listener: Listener<T>) {
    this.listeners.push(listener);
    return () => this.unsubscribe(listener); // Return an unsubscribe function
  }

  unsubscribe(listener: Listener<T>) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  fire(event: T) {
    this.listeners.forEach(listener => listener(event));
  }
}

export { Observable };