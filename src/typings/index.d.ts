import { Observable, Subscription } from 'rxjs';
export {};

type ObservableType<T> = T extends Observable<infer V> ? V : never;

declare global {
  namespace jest {
    interface Matchers<R, T = {}> {
      toEmitValuesWith<E = ObservableType<T>>(expectations: (received: E[]) => void): Promise<CustomMatcherResult>;
    }
  }
}
