// This source code file is AUTO-GENERATED by github.com/taskcluster/jsonschema2go

package model

type (
	Entry struct {

		// Arguments from `route` that must be replaced, they'll appear wrapped in brackets inside `route`.
		//
		// Array items:
		// Argument that appears in `route` warpped in angle brackets. It must be replaced to call the function.
		Args []string `json:"args"`

		// Description (ie. documentation) for the API entry
		Description string `json:"description"`

		// JSON schema for input, if input is validated, otherwise not present. The value must be a relative URI, based on the service's schema location; that is, based at `<rootUrl>/schemas/<serviceName`.
		Input string `json:"input,omitempty"`

		// HTTP method (verb) used to access the function
		//
		// Possible values:
		//   * "get"
		//   * "post"
		//   * "put"
		//   * "head"
		//   * "delete"
		//   * "options"
		//   * "trace"
		//   * "copy"
		//   * "lock"
		//   * "mkcol"
		//   * "move"
		//   * "purge"
		//   * "propfind"
		//   * "proppatch"
		//   * "unlock"
		//   * "report"
		//   * "mkactivity"
		//   * "checkout"
		//   * "merge"
		//   * "m-search"
		//   * "notify"
		//   * "subscribe"
		//   * "unsubscribe"
		//   * "patch"
		//   * "search"
		Method string `json:"method"`

		// Name of the `function` this is a stable identifier for use in auto-generated client libraries
		Name string `json:"name"`

		// One of:
		//   * OutputSchema
		//   * Blob
		Output string `json:"output,omitempty"`

		// List of accepted query-string parameters, these are always optional.
		//
		// Array items:
		// Optional query-string parameter
		Query []string `json:"query,omitempty"`

		// Route for the call, note that arguments wrapped with brackets, like `/user/<userId>/` must be replaced.
		Route string `json:"route"`

		// Scope expression template specifying required scopes for a method. Not provided if authentication isn't required.
		//
		// One of:
		//   * RequiredScope
		//   * Disjunction
		//   * Conjunction
		//   * Conditional
		Scopes ScopeExpressionTemplate `json:"scopes,omitempty"`

		// Stability level of the API
		//
		// Possible values:
		//   * "deprecated"
		//   * "experimental"
		//   * "stable"
		Stability string `json:"stability"`

		// Title of API entry
		Title string `json:"title"`

		// Type of entry, currently only `function`.
		//
		// Possible values:
		//   * "function"
		Type string `json:"type"`
	}

	// Reference of methods implemented by API
	APIReferenceFile struct {

		// Link to schema for this reference. That is a link to this very document. Typically used to identify what kind of reference this file is.
		Schema string `json:"$schema"`

		// Version of the API
		//
		// Syntax:     ^v[0-9]+$
		APIVersion string `json:"apiVersion"`

		// API description in markdown
		Description string `json:"description"`

		// Array of methods in this reference
		Entries []APIEntry `json:"entries"`

		// Name of service for automation. Will be consumed by client generators to produce URLs
		//
		// Syntax:     ^[a-z][a-z0-9_-]*$
		// Min length: 1
		// Max length: 22
		ServiceName string `json:"serviceName"`

		// API title in markdown
		Title string `json:"title"`
	}

	// Output kind if not JSON matching a specific schema.
	//
	// Possible values:
	//   * "blob"
	Blob string

	// if/then objects will replace themselves with the contents of then if the `if` is true
	Conditional struct {

		// One of:
		//   * RequiredScope
		//   * Disjunction
		//   * Conjunction
		//   * Conditional
		//   * ForAll
		Else ScopeExpressionTemplate `json:"else,omitempty"`

		// Syntax:     ^[a-zA-Z][a-zA-Z0-9_]*$
		If string `json:"if"`

		// One of:
		//   * RequiredScope
		//   * Disjunction
		//   * Conjunction
		//   * Conditional
		//   * ForAll
		Then ScopeExpressionTemplate `json:"then"`
	}

	// AllOf objects will evaluate to true if all subexpressions are true
	Conjunction struct {

		// Array items:
		// One of:
		//   * RequiredScope
		//   * Disjunction
		//   * Conjunction
		//   * Conditional
		//   * ForAll
		AllOf []ScopeExpressionTemplate `json:"AllOf"`
	}

	// AnyOf objects will evaluate to true if any subexpressions are true
	Disjunction struct {

		// Array items:
		// One of:
		//   * RequiredScope
		//   * Disjunction
		//   * Conjunction
		//   * Conditional
		//   * ForAll
		AnyOf []ScopeExpressionTemplate `json:"AnyOf"`
	}

	// Reference of exchanges published
	ExchangeReferenceFile struct {

		// Link to schema for this reference. That is a link to this very document. Typically used to identify what kind of reference this file is.
		Schema string `json:"$schema"`

		// Version of the API
		//
		// Syntax:     ^v[0-9]+$
		APIVersion string `json:"apiVersion"`

		// Description of set of exchanges in markdown
		Description string `json:"description"`

		Entries []Var `json:"entries"`

		// Prefix for all exchanges described in this document
		ExchangePrefix string `json:"exchangePrefix"`

		// Name of service for automation. Will be consumed by client generators to produce URLs
		//
		// Syntax:     ^[a-z][a-z0-9_-]*$
		// Min length: 1
		// Max length: 22
		ServiceName string `json:"serviceName"`

		// Title for set of exchanges in markdown
		Title string `json:"title"`
	}

	// for/each/in objects will replace themselves with an array of basic scopes. They will be flattened into the array this object is a part of.
	ForAll struct {

		// Syntax:     ^[\x20-\x7e]*$
		Each string `json:"each"`

		// Syntax:     ^[a-zA-Z][a-zA-Z0-9_]*$
		For string `json:"for"`

		// Syntax:     ^[a-zA-Z][a-zA-Z0-9_]*$
		In string `json:"in"`
	}

	// JSON schema for output, if output is validated, otherwise not present. The value must be a relative URI, based on the service's schema location; that is, based at `<rootUrl>/schemas/<serviceName`.
	OutputSchema string

	// The most basic element of a scope expression
	//
	// Syntax:     ^[\x20-\x7e]*$
	RequiredScope string

	// Manifest of taskcluster service definitions available in a taskcluster service deployment.
	// These manifests are served from `$ROOT_URL/references/manifest.json`.
	TaskclusterServiceManifest struct {

		// Array of URLs of reference documents
		//
		// Array items:
		References []string `json:"references"`
	}

	Var struct {

		// Description (ie. documentation) for the exchange
		Description string `json:"description"`

		// Exchange name on AMQP server, must be prefixed with `exchangePrefix` from this document.
		Exchange string `json:"exchange"`

		// Name of exchange, this is a stable identifier for use in auto-generated client libraries
		Name string `json:"name"`

		RoutingKey []Var1 `json:"routingKey"`

		// JSON schema for messages on this exchange. The value must be a relative URI, based on the service's schema location; that is, based at `<rootUrl>/schemas/<serviceName>`.
		Schema string `json:"schema"`

		// Title of exchange entry
		Title string `json:"title"`

		// Type of entry, currently only `topic-exchange`.
		//
		// Constant value: "topic-exchange"
		Type string `json:"type"`
	}

	Var1 struct {

		// Constant to be used for this field, cannot be overwritten, only present if applicable.
		Constant string `json:"constant,omitempty"`

		// True, if key may contain dots, which AMQP will consider as words. This determines if `#` or `*` should be used in client libraries
		MultipleWords bool `json:"multipleWords"`

		// Identifier usable in client libraries
		Name string `json:"name"`

		// True, if the key is always present, if `false` the value `_` will be used in place when no appropriate value is available for the key.
		Required bool `json:"required"`

		// Short description of key in markdown
		Summary string `json:"summary"`
	}
)
