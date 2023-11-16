import { DurationUnit } from '@grafana/data';
import { Interval } from './types';

type IntervalMap = Record<
  Interval,
  {
    startOf: DurationUnit;
    amount: DurationUnit;
  }
>;

export const intervalMap: IntervalMap = {
  Hourly: { startOf: 'hour', amount: 'hours' },
  Daily: { startOf: 'day', amount: 'days' },
  Weekly: { startOf: 'isoWeek', amount: 'weeks' },
  Monthly: { startOf: 'month', amount: 'months' },
  Yearly: { startOf: 'year', amount: 'years' },
};
