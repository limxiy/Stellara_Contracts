# IPFS Project Metadata Schema

This document defines the expected JSON schema for project metadata stored on IPFS and consumed by the Backend indexer.

## Required Fields

- `title` (string): Human-friendly project title.

## Optional Fields

- `description` (string): Long-form project description.
- `category` (string): Project category label (for example `defi`, `education`, `gaming`).
- `image` (string): URL or IPFS URI for project image.
- `imageUrl` (string): Alias of `image`.
- `tags` (array of strings or comma-separated string): Search/filter tags.

## Example

```json
{
  "title": "Stellara Climate Fund",
  "description": "Funding renewable infrastructure projects in emerging markets.",
  "category": "climate",
  "image": "ipfs://bafybeigdyr.../banner.png",
  "tags": ["climate", "impact", "infrastructure"]
}
```

## Event Payload Integration

`PROJECT_CREATED` events may provide one of the following optional metadata hash fields:

- `ipfsHash`
- `metadataHash`
- `metadataCid`

If none is provided, Backend falls back to generic project metadata.

## Sanitization and Validation Rules

- Strings are trimmed and control characters are stripped.
- `title` max length: 120 characters.
- `description` max length: 2000 characters.
- `category` max length: 64 characters and normalized to lowercase.
- `tags` are normalized to at most 10 entries, each max 32 characters.

## Fallback Behavior

If metadata fetch/parse fails, Backend uses:

- `title`: `Project {projectId}`
- `description`: `null`
- `category`: `uncategorized`

This guarantees stable project creation even when IPFS metadata is unavailable.
