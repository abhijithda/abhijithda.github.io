package solar

import (
	"log"
	"time"
)

const shortForm = "2006-Jan-02"

func IsValidDate(date string) bool {
	t, err := time.Parse(shortForm, date)
	if err != nil {
		return false
	}
	log.Println("Solar Date:", t)
	return true
}

func GetNumberOfDays(date string) float64 {
	t, _ := time.Parse(shortForm, date)
	diff := time.Since(t)
	log.Println("Number of Hours:", diff.Hours())
	// Return in days
	return diff.Hours() / 24
}
