# Assessment contract v1

`klein-sdk/assessment` is the versioned interchange boundary for assessment and
exercise content. It is intentionally separate from `klein-sdk/exam`, which
contains the older browser/runtime exam controls.

Version 1 standardizes:

- safe content blocks for text, LaTeX, first-party assets, PDF page references,
  accessible media, code, shared stimuli, and Klein tool starters;
- single and multiple choice, boolean, short and extended text, numeric,
  mathematical-expression, photo/file, Klein tool-snapshot, and composite
  interactions with matching response payloads;
- orthogonal delivery context and assistance categories; and
- a strictly validated learner-safe item DTO that cannot carry answer keys,
  solutions, scoring rules, rubrics, author tests, or feedback.

Assets and tool snapshots are referenced by opaque artifact IDs. The v1 surface
does not accept HTML, scripts, iframes, public asset URLs, or arbitrary metadata.
Authorized server-side authoring and scoring contracts must remain separate.
For a blank first-party tool interaction, `starterSnapshotAssetId` is `null`.
Runtime guards accept plain JSON objects/arrays and fail closed for crafted
prototypes, accessors, symbols, non-enumerable properties, or array metadata.

This is the first contract slice, not the complete standardized catalogue.
Matrix, set/interval/vector, gap-fill, matching, ordering, hotspot, drawing,
specialized graphing, specialized geometry-lab, and specialized probability
interactions are deferred. Until their semantics are standardized, tool work is
represented by the generic `tool_snapshot` interaction and response.

Canonical cross-implementation examples are shipped in
`fixtures/assessment/v1/`.
