GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
GOMOD=$(GOCMD) mod
GOFMT=gofmt -w .

.PHONY: all fmt tidy build clean re

all: fmt tidy build

fmt:
	$(GOFMT)

tidy:
	$(GOCMD) mod tidy

build:
	GOOS=linux GOARCH=amd64 $(GOCMD) build -o cli ./cmd/cli/main.go

clean:
	$(GOCMD) clean
	$(GOCMD) mod tidy
	rm -f cli

re: clean all