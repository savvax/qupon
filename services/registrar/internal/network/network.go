// Package network describes which Solana cluster this registrar instance serves. One instance serves one
// network; the profile comes from the base qupon config (config/devnet.json or config/mainnet-beta.json).
package network

import (
	"encoding/json"
	"fmt"
	"os"
)

// Profile is the network this instance runs on.
type Profile struct {
	Name            string `json:"network"`         // devnet | mainnet-beta
	ProgramID       string `json:"programId"`       // qupon_bonds program id on this network
	ExplorerCluster string `json:"explorerCluster"` // ?cluster= value for explorer links; "" on mainnet
	Mainnet         bool   `json:"mainnet"`
}

// FromConfig reads cluster and programId from a qupon config file.
func FromConfig(path string) (Profile, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Profile{}, fmt.Errorf("read network config: %w", err)
	}
	var c struct {
		Cluster   string `json:"cluster"`
		ProgramID string `json:"programId"`
	}
	if err := json.Unmarshal(raw, &c); err != nil {
		return Profile{}, fmt.Errorf("parse network config %s: %w", path, err)
	}
	return New(c.Cluster, c.ProgramID)
}

// New validates a cluster name and builds its profile.
func New(cluster, programID string) (Profile, error) {
	switch cluster {
	case "devnet":
		return Profile{Name: "devnet", ProgramID: programID, ExplorerCluster: "devnet"}, nil
	case "mainnet-beta":
		return Profile{Name: "mainnet-beta", ProgramID: programID, Mainnet: true}, nil
	default:
		return Profile{}, fmt.Errorf("unsupported cluster %q (devnet | mainnet-beta)", cluster)
	}
}
