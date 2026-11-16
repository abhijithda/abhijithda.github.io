package lunar

import (
	"math"
)

// GetAge based on lunar calender.
func GetAge(days float64) (yy, mm, dd int) {
	// A lunar calendar has only 360 days
	yy = int((days / 360))
	remDays := math.Mod(days, 360)
	mm = int(remDays / 30)
	dd = int(math.Mod(remDays, 30))
	return yy, mm, dd
}
