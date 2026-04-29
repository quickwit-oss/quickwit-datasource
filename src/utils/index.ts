// import { gte, SemVer } from 'semver';

import { isMetricAggregationWithField } from '../components/QueryEditor/MetricAggregationsEditor/aggregations';
import { metricAggregationConfig } from '../components/QueryEditor/MetricAggregationsEditor/utils';
import { MetricAggregation, MetricAggregationWithInlineScript } from '../types';

export const describeMetric = (metric: MetricAggregation) => {
  if (!isMetricAggregationWithField(metric)) {
    return metricAggregationConfig[metric.type].label;
  }

  // TODO: field might be undefined
  return `${metricAggregationConfig[metric.type].label} ${metric.field}`;
};

export const extractJsonPayload = (msg: string) => {
  const match = msg.match(/{.*}/);

  if (!match) {
    return null;
  }

  try {
      return JSON.parse(match[0]);
  } catch (error) {
      return null;
  }
}

/**
 * Utility function to clean up aggregations settings objects.
 * It removes nullish values and empty strings, array and objects
 * recursing over nested objects (not arrays).
 * @param obj
 */
export const removeEmpty = <T extends {}>(obj: T): Partial<T> =>
  Object.entries(obj).reduce((acc, [key, value]) => {
    // Removing nullish values (null & undefined)
    if (value == null) {
      return { ...acc };
    }

    // Removing empty arrays (This won't recurse the array)
    if (Array.isArray(value) && value.length === 0) {
      return { ...acc };
    }

    // Removing empty strings
    if (typeof value === 'string' && value.length === 0) {
      return { ...acc };
    }

    // Recursing over nested objects
    if (!Array.isArray(value) && typeof value === 'object') {
      const cleanObj = removeEmpty(value);

      if (Object.keys(cleanObj).length === 0) {
        return { ...acc };
      }

      return { ...acc, [key]: cleanObj };
    }

    return {
      ...acc,
      [key]: value,
    };
  }, {});

/**
 *  This function converts an order by string to the correct metric id For example,
 *  if the user uses the standard deviation extended stat for the order by,
 *  the value would be "1[std_deviation]" and this would return "1"
 */
export const convertOrderByToMetricId = (orderBy: string): string | undefined => {
  const metricIdMatches = orderBy.match(/^(\d+)/);
  return metricIdMatches ? metricIdMatches[1] : void 0;
};

/** Gets the actual script value for metrics that support inline scripts.
 *
 *  This is needed because the `script` is a bit polymorphic.
 *  when creating a query with Grafana < 7.4 it was stored as:
 * ```json
 * {
 *    "settings": {
 *      "script": {
 *        "inline": "value"
 *      }
 *    }
 * }
 * ```
 *
 * while from 7.4 it's stored as
 * ```json
 * {
 *    "settings": {
 *      "script": "value"
 *    }
 * }
 * ```
 *
 * This allows us to access both formats and support both queries created before 7.4 and after.
 */
export const getScriptValue = (metric: MetricAggregationWithInlineScript) =>
  (typeof metric.settings?.script === 'object' ? metric.settings?.script?.inline : metric.settings?.script) || '';

// export const isSupportedVersion = (version: SemVer): boolean => {
//   if (gte(version, '7.16.0')) {
//     return true;
//   }

//   return false;
// };

export const unsupportedVersionMessage =
  'Support for Elasticsearch versions after their end-of-life (currently versions < 7.16) was removed. Using unsupported version of Elasticsearch may lead to unexpected and incorrect results.';

export const fieldTypeMap: Record<string, string> = {
  date: 'date',
  date_nanos: 'date',
  keyword: 'string',
  text: 'string',
  binary: 'string',
  byte: 'number',
  long: 'number',
  unsigned_long: 'number',
  double: 'number',
  integer: 'number',
  short: 'number',
  float: 'number',
  scaled_float: 'number'
};

export const isSet = (v: string) => v !== '' && v !== undefined && v !== null;

export const hasWhiteSpace = (s: string) => /\s/g.test(s);

export const isSimpleToken = (s: string) => /^[A-Za-z0-9_]+$/.test(s);

const normalizeSearchText = (value: string) => value.toLowerCase();

const searchTokens = (value: string) =>
  normalizeSearchText(value)
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);

const isSubsequence = (needle: string, haystack: string) => {
  let needleIndex = 0;
  for (let haystackIndex = 0; haystackIndex < haystack.length && needleIndex < needle.length; haystackIndex++) {
    if (needle[needleIndex] === haystack[haystackIndex]) {
      needleIndex++;
    }
  }
  return needleIndex === needle.length;
};

const levenshteinDistance = (a: string, b: string, maxDistance: number) => {
  if (Math.abs(a.length - b.length) > maxDistance) {
    return maxDistance + 1;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }
    previous = current;
  }

  return previous[b.length];
};

const fuzzyTokenScore = (candidateTokens: string[], compactCandidate: string, token: string): number | null => {
  if (!token) {
    return 0;
  }

  let best: number | null = null;
  for (const candidateToken of candidateTokens) {
    let score: number | null = null;
    if (candidateToken === token) {
      score = 0;
    } else if (candidateToken.startsWith(token)) {
      score = 10 + candidateToken.length - token.length;
    } else if (candidateToken.includes(token)) {
      score = 25 + candidateToken.indexOf(token);
    } else if (isSubsequence(token, candidateToken)) {
      score = 50 + candidateToken.length - token.length;
    } else if (token.length >= 3) {
      const maxDistance = Math.max(1, Math.floor(token.length / 3));
      const distance = levenshteinDistance(token, candidateToken, maxDistance);
      if (distance <= maxDistance) {
        score = 80 + distance * 10 + Math.abs(candidateToken.length - token.length);
      }
    }

    if (score !== null && (best === null || score < best)) {
      best = score;
    }
  }

  if (best === null && compactCandidate.includes(token)) {
    return 35 + compactCandidate.indexOf(token);
  }

  return best;
};

export const fuzzySearchScore = (text: string, query?: string): number | null => {
  const trimmedQuery = query?.trim();
  if (!trimmedQuery) {
    return 0;
  }

  const normalizedText = normalizeSearchText(text);
  const normalizedQuery = normalizeSearchText(trimmedQuery);
  if (normalizedText === normalizedQuery) {
    return 0;
  }
  if (normalizedText.startsWith(normalizedQuery)) {
    return 5 + normalizedText.length - normalizedQuery.length;
  }
  if (normalizedText.includes(normalizedQuery)) {
    return 15 + normalizedText.indexOf(normalizedQuery);
  }

  const candidateTokens = searchTokens(text);
  const compactCandidate = candidateTokens.join('');
  const queryTokens = searchTokens(trimmedQuery);
  let total = 0;
  for (const token of queryTokens) {
    const score = fuzzyTokenScore(candidateTokens, compactCandidate, token);
    if (score === null) {
      return null;
    }
    total += score;
  }

  return total;
};

export const fuzzySearchMatch = (text: string, query?: string) => fuzzySearchScore(text, query) !== null;

export function fuzzySearchSort<T>(items: T[], getText: (item: T) => string, query?: string): T[] {
  return items
    .map((item, index) => ({ item, index, score: fuzzySearchScore(getText(item), query) }))
    .filter((item): item is { item: T; index: number; score: number } => item.score !== null)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ item }) => item);
}
