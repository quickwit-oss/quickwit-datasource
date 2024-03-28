package utils

import (
	"errors"
	"fmt"
	"reflect"
	"time"

	timefmt "github.com/itchyny/timefmt-go"
)

const (
	Iso8601         string = "iso8601"
	Rfc2822         string = "rfc2822"  // timezone name
	Rfc2822z        string = "rfc2822z" // explicit timezone
	Rfc3339         string = "rfc3339"
	TimestampSecs   string = "unix_timestamp_secs"
	TimestampMillis string = "unix_timestamp_millis"
	TimestampMicros string = "unix_timestamp_micros"
	TimestampNanos  string = "unix_timestamp_nanos"
)

const Rfc2822Layout string = "%a, %d %b %Y %T %Z"
const Rfc2822zLayout string = "%a, %d %b %Y %T %z"

// Parses a value into Time given a timeOutputFormat. The conversion
// only works with float64 as this is what we get when parsing a response.
func ParseTime(value any, timeOutputFormat string) (time.Time, error) {
	switch timeOutputFormat {
	case Iso8601, Rfc3339:
		value_string := value.(string)
		timeValue, err := time.Parse(time.RFC3339, value_string)
		if err != nil {
			return time.Time{}, err
		}
		return timeValue, nil

	case Rfc2822:
		// XXX: the time package's layout for RFC2822 is bogus, don't use that.
		value_string := value.(string)
		timeValue, err := timefmt.Parse(value_string, Rfc2822Layout)
		if err != nil {
			return time.Time{}, err
		}
		return timeValue, nil
	case Rfc2822z:
		// XXX: the time package's layout for RFC2822 is bogus, don't use that.
		value_string := value.(string)
		timeValue, err := timefmt.Parse(value_string, Rfc2822zLayout)
		if err != nil {
			return time.Time{}, err
		}
		return timeValue, nil

	case TimestampSecs, TimestampMillis, TimestampMicros, TimestampNanos:
		var value_i64 int64
		switch value.(type) {
		case int, int8, int16, int32, int64:
			value_i64 = reflect.ValueOf(value).Int()
		case float32, float64:
			value_f64 := reflect.ValueOf(value).Float()
			value_i64 = int64(value_f64)
		default:
			return time.Time{}, errors.New("parseTime only accepts float64 or int64 values with timestamp based formats")
		}

		if timeOutputFormat == TimestampSecs {
			return time.Unix(value_i64, 0), nil
		} else if timeOutputFormat == TimestampMillis {
			return time.Unix(0, value_i64*1_000_000), nil
		} else if timeOutputFormat == TimestampMicros {
			return time.Unix(0, value_i64*1_000), nil
		} else if timeOutputFormat == TimestampNanos {
			return time.Unix(0, value_i64), nil
		}
	default:
		value_string := value.(string)
		timeValue, err := timefmt.Parse(value_string, timeOutputFormat)
		if err != nil {
			return time.Time{}, err
		}
		return timeValue, nil
	}
	return time.Time{}, fmt.Errorf("timeOutputFormat not supported yet %s", timeOutputFormat)
}
