// Command registrar is the Qupon off-chain service (scheduler, reader, reconciler, ISO 20022, REST).
package main

import "fmt"

var version = "0.1.0-dev"

func main() {
	fmt.Println("qupon registrar", version)
}
