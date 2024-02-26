export const MILLISECOND = 1;
export const SECOND = 1000 * MILLISECOND;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function getIntervalInfo(timespanMs: number, resolution: number): { interval: string; intervalMs?: number } {
  let intervalMs = timespanMs / resolution;
  let interval = '';

  // below 5 seconds we force the resolution to be per 1ms as interval in scopedVars is not less than 10ms
  if (timespanMs < SECOND * 5) {
    intervalMs = MILLISECOND;
    interval = '1ms';
  } else if (intervalMs > HOUR) {
    intervalMs = DAY;
    interval = '1d';
  } else if (intervalMs > 10*MINUTE) {
    intervalMs = HOUR;
    interval = '1h';
  } else if (intervalMs > MINUTE) {
    intervalMs = 10*MINUTE;
    interval = '10m';
  } else if (intervalMs > 10*SECOND) {
    intervalMs = MINUTE;
    interval = '1m';
  } else if (intervalMs > SECOND) {
    intervalMs = 10*SECOND;
    interval = '10s';
  } else {
    intervalMs = SECOND;
    interval = '1s';
  }

  return { interval, intervalMs };
}
