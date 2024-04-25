import { LogRowContextQueryDirection } from "./LogContextProvider";
import { createContextTimeRange } from "./utils";


describe('Test LogContextProvider/utils:createContextTimeRange', () => {

  it('Should produce a range overlapping target', () => {
    const targetTimestampMicros = 1714062468704123
    const targetTimestampMillis = 1714062468704
    const range = createContextTimeRange(targetTimestampMillis, LogRowContextQueryDirection.Backward)

    expect(range.from.toDate().getTime() * 1000).toBeLessThanOrEqual(targetTimestampMicros);
    expect(range.to.toDate().getTime() * 1000).toBeGreaterThanOrEqual(targetTimestampMicros);
  });
});
