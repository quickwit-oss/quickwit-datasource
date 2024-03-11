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
