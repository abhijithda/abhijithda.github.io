package solar

import (
	"testing"
)

func Test_IsValidSolarDate(t *testing.T) {

	tests := []struct {
		description     string
		date            string
		expectedIsValid bool
	}{
		{
			description:     "Valid solar date 2017-Oct-14",
			date:            "2017-Oct-14",
			expectedIsValid: true,
		},
		{
			description:     "Valid solar leap year date 2016-Feb-29",
			date:            "2016-Feb-29",
			expectedIsValid: true,
		},
		{
			description:     "Invalid solar date 2017-Feb-29",
			date:            "2017-Feb-29",
			expectedIsValid: false,
		},
		{
			description:     "Invalid solar date 2017-Jun-31",
			date:            "2017-Jun-31",
			expectedIsValid: false,
		},
	}

	for _, tc := range tests {
		isValid := IsValidDate(tc.date)
		if isValid != tc.expectedIsValid {
			t.Logf("got %v, want %v", isValid, tc.expectedIsValid)
		}
	}
}
