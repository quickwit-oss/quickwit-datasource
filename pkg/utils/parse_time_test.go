package utils

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
)

const (
	testYear        int = 2024
	testMonth       int = 3
	testDay         int = 28
	testHour        int = 12
	testMinute      int = 34
	testSecond      int = 56
	testUnixSeconds int = 1711629296
	testMilli       int = testUnixSeconds*1000 + 987
	testMicro       int = testMilli*1000 + 654
	testNano        int = testMicro*1000 + 321
)

var successTests = []struct {
	value            any
	timeOutputFormat string
}{
	// RFC3339
	{"2024-03-28T12:34:56.987Z", Rfc3339},
	// RFC2822
	{"Thu, 28 Mar 2024 12:34:56 GMT", Rfc2822},
	{"Thu, 28 Mar 2024 12:34:56 +0000", Rfc2822z},
	// Custom layout
	{"2024-03-28 12:34:56", "%Y-%m-%d %H:%M:%S"},
	{"2024-03-28 12:34:56.987", "%Y-%m-%d %H:%M:%S.%f"},
	// Int timestamps
	{1711629296, TimestampSecs},
	{1711629296987, TimestampMillis},
	{1711629296987654, TimestampMicros},
	{1711629296987654321, TimestampNanos},
	// Float timestamps
	{1711629296., TimestampSecs},
	{1711629296987., TimestampMillis},
	{1711629296987654., TimestampMicros},
	// {1711629296987654321., TimestampNanos}, // Float precision fail
}

func TestParseTime(t *testing.T) {
	assert := assert.New(t)
	for _, tt := range successTests {
		t.Run(fmt.Sprintf("Parse %s", tt.timeOutputFormat), func(t *testing.T) {
			time, err := ParseTime(tt.value, tt.timeOutputFormat)
			assert.Nil(err)
			assert.NotNil(time)
			// Check day
			assert.Equal(testYear, int(time.UTC().Year()), "Year mismatch")
			assert.Equal(testMonth, int(time.UTC().Month()), "Month mismatch")
			assert.Equal(testDay, int(time.UTC().Day()), "Day mismatch")
			assert.Equal(testHour, int(time.UTC().Hour()), "Hour mismatch")
			assert.Equal(testMinute, int(time.UTC().Minute()), "Minute mismatch")
			assert.Equal(testSecond, int(time.UTC().Second()), "Second mismatch")

			switch tt.timeOutputFormat {
			case TimestampNanos:
				assert.Equal(testNano, int(time.UTC().UnixNano()), "Nanosecond mismatch")
				fallthrough
			case TimestampMicros:
				assert.Equal(testMicro, int(time.UTC().UnixMicro()), "Microsecond mismatch")
				fallthrough
			case Rfc3339, TimestampMillis:
				assert.Equal(testMilli, int(time.UTC().UnixMilli()), "Millisecond mismatch")
			}
		})
	}
}
