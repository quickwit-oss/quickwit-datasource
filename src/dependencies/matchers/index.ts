import { ObservableMatchers } from './types';
import { toEmitValuesWith } from './toEmitValuesWith';
import { Observable } from 'rxjs';

export const matchers: ObservableMatchers<void, Observable<any>> = {
  toEmitValuesWith,
};
