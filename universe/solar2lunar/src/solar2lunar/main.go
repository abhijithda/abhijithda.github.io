package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	l "./internal/lunar"
	s "./internal/solar"
)

const myLogFile = "solar.log"

func main() {
	f, err := os.OpenFile(myLogFile, os.O_RDWR|os.O_CREATE|os.O_APPEND, 0666)
	if err != nil {
		log.Fatalf("Error opening file: %v", err)
	}
	defer f.Close()

	log.SetOutput(f)

	var solarDate string
	flag.StringVar(&solarDate, "solarDate", "2017-Oct-14", "Enter date as per solar calendar in the format: yyyy-mon-dd")
	flag.Parse()

	fmt.Println("Solar Date:", solarDate)
	if !(s.IsValidDate(solarDate)) {
		fmt.Println("Not a valid date as per solar calendar", solarDate)
		return
	}
	days := s.GetNumberOfDays(solarDate)
	fmt.Println("Number of Days:", int(days))

	yy, mm, dd := l.GetAge(days)
	fmt.Printf("Age as Lunar calendar: %d years %d months %d days\n", yy, mm, dd)
}
