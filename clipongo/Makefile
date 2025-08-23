# Makefile for Pong Game and CLI

GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
GOMOD=$(GOCMD) mod
GOFMT=gofmt -w .

.PHONY: fmt cli clean re build-linux build-mac build-all
fmt:
	$(GOFMT)

cli:
	$(GOMOD) tidy
	$(GOBUILD) -o cli ./cmd/cli/main.go

clean:
	$(GOCLEAN)
	$(GOMOD) tidy
	rm -f cli cli-linux cli-mac

re: fmt clean cli

build-linux:
	GOOS=linux GOARCH=amd64 $(GOBUILD) -o cli-linux ./cmd/cli/main.go

build-mac:
	GOOS=darwin GOARCH=amd64 $(GOBUILD) -o cli-mac ./cmd/cli/main.go

build-all: build-linux build-mac