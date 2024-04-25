import { dateTime, TimeRange } from "@grafana/data";
import { LogRowContextQueryDirection } from './LogContextProvider';


export function createContextTimeRange(rowTimeEpochMs: number, direction?: LogRowContextQueryDirection): TimeRange {
  const offset = 7;
  let timeFrom = dateTime(rowTimeEpochMs);
  let timeTo = dateTime(rowTimeEpochMs);

  if (direction === LogRowContextQueryDirection.Backward) {
    // Add 1 to avoid missing results due to precision gap
    timeTo = dateTime(rowTimeEpochMs + 1);
  }

  const timeRange = {
    from: (direction === LogRowContextQueryDirection.Forward) ? timeFrom.utc() : timeFrom.subtract(offset, 'hours').utc(),
    to: (direction === LogRowContextQueryDirection.Backward) ? timeTo.utc() : timeTo.add(offset, 'hours').utc(),
  };
  return { ...timeRange, raw: timeRange };
}
