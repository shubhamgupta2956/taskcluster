package apis

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	assert "github.com/stretchr/testify/require"
)

var codegenServer *httptest.Server

// TestCodeGeneration ensures that we generate the right code
// (i.e. matches the code in services_test.go) when calling a server
// it calls an httptest server to get data
func TestCodeGeneration(t *testing.T) {
	assert := assert.New(t)

	// launch server
	codegenServer = manifestServer()
	defer codegenServer.Close()

	// query server, generate code
	source, err := GenerateServices(codegenServer.URL+"/manifest.json", "servicesTest", "schemasTest")
	assert.NoError(err, fmt.Sprintf("failed generating services: %s", err))

	// check that the returned byte thing is correct
	expected := getExpectedOutput()
	actual := strings.Trim(string(source), "\n\r\t ")
	assert.Equal(expected, actual, "generated code doesn't match desired code")
}

// manifestServer sets up the server before launching it in a new thread
func manifestServer() *httptest.Server {
	handler := http.NewServeMux()
	handler.HandleFunc("/manifest.json", manifestHandler)
	handler.HandleFunc("/definition.json", apiDefHandler)

	return httptest.NewServer(handler)
}

// manifestHandler returns the test manifest on request
func manifestHandler(w http.ResponseWriter, _ *http.Request) {
	manifest := `{"Test": "` + codegenServer.URL + `/definition.json"}`
	io.WriteString(w, manifest)
}

// apiDefHandler returns the api definition on request
func apiDefHandler(w http.ResponseWriter, _ *http.Request) {
	definition := `{
  "version": 0,
  "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
  "title": "Test API",
  "description": "This is a Test service to test taskcluster-cli",
  "servicename": "test",
  "entries": [
    {
      "type": "function",
      "method": "get",
      "route": "/test",
      "query": [],
      "args": [],
      "name": "test",
      "stability": "stable",
      "title": "Do a test",
      "description": "The server will match the request against a specific format to see if tc-cli works properly."
    }
  ]
}`
	io.WriteString(w, definition)
}

// TODO possibly test generation of schemas

// getExpectedOutput simply returns the code that should be generated
func getExpectedOutput() string {
	return `package apis

// Code generated by fetch-apis; DO NOT EDIT

import "github.com/taskcluster/taskcluster/clients/client-shell/apis/definitions"

var servicesTest = map[string]definitions.Service{
	"Test": definitions.Service{
		ServiceName: "test",
		Title:       "Test API",
		Description: "This is a Test service to test taskcluster-cli",
		Entries: []definitions.Entry{
			definitions.Entry{
				Type:        "function",
				Name:        "test",
				Title:       "Do a test",
				Description: "The server will match the request against a specific format to see if tc-cli works properly.",
				Scopes:      [][]string(nil),
				Stability:   "stable",
				Method:      "get",
				Route:       "/test",
				Args:        []string{},
				Query:       []string{},
				Input:       "",
				Output:      "",
			},
		},
	},
}
var schemasTest = map[string]string{}`
}
