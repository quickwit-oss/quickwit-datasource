package utils

import (
	"encoding/json"
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
	switch value.(type) {
	case string:
		value_string := value.(string)
		switch timeOutputFormat {
		case Iso8601, Rfc3339:
			timeValue, err := time.Parse(time.RFC3339, value_string)
			if err != nil {
				return time.Time{}, err
			}
			return timeValue, nil

		case Rfc2822:
			// XXX: the time package's layout for RFC2822 is bogus, don't use that.
			timeValue, err := timefmt.Parse(value_string, Rfc2822Layout)
			if err != nil {
				return time.Time{}, err
			}
			return timeValue, nil

		case Rfc2822z:
			// XXX: the time package's layout for RFC2822 is bogus, don't use that.
			timeValue, err := timefmt.Parse(value_string, Rfc2822zLayout)
			if err != nil {
				return time.Time{}, err
			}
			return timeValue, nil

		case TimestampSecs, TimestampMillis, TimestampMicros, TimestampNanos:
			return time.Time{}, fmt.Errorf("ParseTime received incoherent inputs: timeOutputFormat: %s value: %s (%s)", timeOutputFormat, fmt.Sprint(value), reflect.TypeOf(value))

		default:
			timeValue, err := timefmt.Parse(value_string, timeOutputFormat)
			if err != nil {
				return time.Time{}, err
			}
			return timeValue, nil
		}
	default:
		var value_i64 int64
		switch value.(type) {
		case json.Number:
			var err error
			valueNumber := value.(json.Number)
			value_i64, err = valueNumber.Int64()
			if nil != err {
				return time.Time{}, errors.New("couldn't convert timestamp from json.Number to Int64")
			}
		case int, int8, int16, int32, int64:
			value_i64 = reflect.ValueOf(value).Int()
		case float32, float64:
			value_f64 := reflect.ValueOf(value).Float()
			value_i64 = int64(value_f64)
		default:
			return time.Time{}, fmt.Errorf("ParseTime does not support values of type (%s)", reflect.TypeOf(value))
		}

		switch timeOutputFormat {
		case TimestampSecs:
			return time.Unix(value_i64, 0), nil
		case TimestampMillis:
			return time.Unix(0, value_i64*1_000_000), nil
		case TimestampMicros:
			return time.Unix(0, value_i64*1_000), nil
		case TimestampNanos:
			return time.Unix(0, value_i64), nil
		default:
			return time.Time{}, fmt.Errorf("ParseTime received incoherent inputs: timeOutputFormat: %s value: %s (%s)", timeOutputFormat, fmt.Sprint(value), reflect.TypeOf(value))
		}
	}
}
