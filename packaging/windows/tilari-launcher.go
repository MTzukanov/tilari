// Portable Windows entry for Tilari: run bundled Node against the launcher.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func main() {
	exe, err := os.Executable()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	root, err := filepath.Abs(filepath.Dir(exe))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	node := filepath.Join(root, "node", "node.exe")
	serverDir := filepath.Join(root, "app", "server")
	www := filepath.Join(root, "app", "www")

	args := append([]string{"--import", "tsx", "src/launcher.ts"}, os.Args[1:]...)
	cmd := exec.Command(node, args...)
	cmd.Dir = serverDir
	cmd.Env = append(os.Environ(), "TILARI_STATIC="+www)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			os.Exit(ee.ExitCode())
		}
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
