# Backend API Versioning Strategy

## Overview
The backend now supports explicit URI versioning for REST APIs using the pattern `/api/v{n}/...`.
Version negotiation is handled consistently through request path detection and optional headers.

## Routing strategy
* Base API root: `/api`
* Versioned endpoints:
  * `/api/v1/...`
  * `/api/v2/...`
* Requests without an explicit version may still be routed based on headers and default version rules.

## Version negotiation
The middleware accepts version information from:
* Path prefix (highest priority): `/api/v1`, `/api/v2`
* `X-API-Version` header, e.g. `X-API-Version: v2`
* `Accept` vendor header, e.g. `Accept: application/vnd.stellara.v2+json`
* `Accept: application/json;version=2`

If the request does not include a version, the default version is `v1`.

## Deprecation and sunset headers
Version 1 responses now include the following headers:
* `Deprecation: true`
* `Sunset: Sat, 01 Jan 2027 00:00:00 GMT`
* `Link: </api/v2>; rel="successor-version"`

These headers let clients identify sunset timelines and follow the successor version link.

## Compatibility matrix
| Version | Status | Path | Notes |
|--------|--------|------|-------|
| `v1` | Deprecated but supported | `/api/v1/...` | Stable legacy contract. Includes deprecation headers and successor link. |
| `v2` | Current rollout | `/api/v2/...` | Supports version negotiation, improved responses, and upgraded error messages. |

## Migration guide
1. Update clients from `/api/v1/...` to `/api/v2/...`.
2. Prefer `X-API-Version` or vendor `Accept` header for explicit version negotiation.
3. Use `/api/v1/status` and `/api/v2/status` to verify routing and header behavior.
4. Keep one version active in production while gradually onboarding clients.

## Sunset policy
* All deprecated versions must emit `Deprecation` and `Sunset` headers.
* The sunset deadline is set via `API_VERSION_SUNSET`.
* Backward compatible fixes may still be applied to sunset versions, but breaking changes are reserved for newer versions.
* The `Link` header must point to the successor version.

## Automated compatibility tests
* Version negotiation and fallback routing are covered by tests in `src/versioning/api-versioning.spec.ts`.
* The tests validate headers, routing behavior, and version selection for both `v1` and `v2`.

## v2 improvement plan
* Add explicit `apiVersion` metadata to v2 responses.
* Introduce v2-only validation rules and richer error messages.
* Support optional new query parameters for modernized clients.
* Maintain v1 compatibility for existing integrations while enabling new v2 features behind versioned paths.
