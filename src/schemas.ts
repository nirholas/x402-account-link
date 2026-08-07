/**
 * Per-route invocation contracts published inside every x402 402 challenge as
 * `accepts[].outputSchema` — `input` tells an agent how to build the request
 * (method, path/query params, JSON body fields), `output` is the JSON Schema of
 * the successful response body. An agent that has never seen this API can
 * therefore call it correctly straight from the challenge it just received.
 *
 * Derived from `openapi.json`, so the runtime challenge (which the x402scan
 * discovery spec treats as authoritative) can never contradict the published
 * spec. Keys match the paywall route map exactly: `"<VERB> /path"`, with `*`
 * standing in for a path parameter.
 */

/** The `outputSchema` value carried by every accept entry of a paid route. */
export type RouteSchema = {
  /** How to invoke the route: HTTP method, parameters, request body fields. */
  input: Record<string, unknown>;
  /** JSON Schema of the 2xx response body. */
  output: Record<string, unknown>;
};

/** Keyed exactly like the paywall route map — spread into each route entry. */
export const ROUTE_SCHEMAS: Record<string, { outputSchema: RouteSchema }> = {
  "POST /links": {
    outputSchema: {
      "input": {
        "type": "http",
        "method": "POST",
        "path": "/links",
        "bodyType": "json",
        "bodyFields": {
          "owner": {
            "type": "string",
            "description": "0x wallet address controlling the link"
          },
          "service": {
            "type": "string"
          },
          "label": {
            "type": "string"
          },
          "scopes": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "credentials": {
            "type": "object",
            "description": "Encrypted at rest; never returned"
          },
          "ttlSeconds": {
            "type": "integer"
          }
        },
        "bodyFieldsRequired": [
          "owner",
          "service",
          "scopes",
          "credentials"
        ]
      },
      "output": {
        "type": "object",
        "properties": {
          "link": {
            "type": "object",
            "properties": {
              "linkId": {
                "type": "string"
              },
              "owner": {
                "type": "string"
              },
              "service": {
                "type": "string"
              },
              "label": {
                "type": "string"
              },
              "scopes": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "createdAt": {
                "type": "string",
                "format": "date-time"
              },
              "expiresAt": {
                "type": "string",
                "format": "date-time"
              },
              "credentialFingerprint": {
                "type": "string"
              },
              "revoked": {
                "type": "boolean"
              }
            }
          },
          "proof": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string"
              },
              "signedFields": {
                "type": "string"
              },
              "signature": {
                "type": "string"
              }
            }
          }
        }
      }
    },
  },
  "GET /links/*/token": {
    outputSchema: {
      "input": {
        "type": "http",
        "method": "GET",
        "path": "/links/{id}/token",
        "pathParams": {
          "id": {
            "type": "string"
          }
        },
        "pathParamsRequired": [
          "id"
        ],
        "queryParams": {
          "scope": {
            "type": "string",
            "description": "Comma-separated subset of link scopes"
          },
          "ttlSeconds": {
            "type": "integer",
            "minimum": 30,
            "maximum": 86400
          }
        },
        "headers": {
          "X-Owner-Signature": {
            "type": "string",
            "description": "EIP-191 signature over the owner challenge"
          },
          "X-Owner-Timestamp": {
            "type": "string"
          }
        }
      },
      "output": {
        "type": "object",
        "properties": {
          "token": {
            "type": "string"
          },
          "linkId": {
            "type": "string"
          },
          "service": {
            "type": "string"
          },
          "scope": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "issuedAt": {
            "type": "string",
            "format": "date-time"
          },
          "expiresAt": {
            "type": "string",
            "format": "date-time"
          },
          "ttlSeconds": {
            "type": "integer"
          }
        }
      }
    },
  },
};
