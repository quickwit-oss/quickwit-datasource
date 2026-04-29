import { QueryFilter } from '@/dataquery.gen';

export function uidMaker(prefix: string){
  let i = 1;
  return {
    next() {

      return `${prefix}-${i++}`;
    },
    reset() {
      i=1;
    }
  }
}

export function newFilterId(): QueryFilter['id'] {
  return Math.floor(Math.random() * 100_000_000).toString()
}
