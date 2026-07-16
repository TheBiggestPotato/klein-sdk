# Klein Whiteboard Feature List

The current SDK whiteboard is framework-independent TypeScript with DOM/SVG rendering. It is intended to move toward Microsoft Whiteboard-style classroom use while keeping the SDK embeddable in Klein Client, Teams, Classroom, and custom hosts.

## Implemented Now

- Infinite canvas with pan, wheel pan, and Ctrl/Cmd wheel zoom.
- Dot grid background and configurable background color.
- Pen and highlighter ink.
- Object eraser.
- Select, box select, move, delete, clear.
- Undo and redo.
- Rectangle, ellipse, triangle, diamond, polygon.
- Line, arrow, double arrow, and dashed connector.
- Text boxes.
- Sticky notes.
- Images by URL or data URL.
- Reaction stamps.
- Frames for lesson regions or export boundaries.
- Built-in templates: brainstorm, Kanban, lesson flow, SWOT, grid, Cornell notes.
- Embedded calculator snapshot cards for graphing, 3D, scientific, and probability outputs.
- Serializable snapshots and deltas for collaboration/persistence.
- Strong snapshot and delta validation for every persisted element kind.
- Collaboration delta compaction for repeated viewport changes, drag updates, add/delete pairs, and dense ink strokes.
- Framework-independent object comment and presence overlay contracts.
- Frame-level SVG export helpers for lesson regions.
- JSON, SVG, PNG, and thumbnail export.
- Host-renderable tool metadata with stable ids, groups, and shortcuts.
- Large-board SVG smoke coverage.
- Keyboard shortcuts for common tools.

## Microsoft Whiteboard Parity Targets

- Ink beautification and shape recognition.
- Ruler / straightedge tool.
- More template categories and custom template saving.
- Rich text editing, resizing handles, and inline editing without prompts.
- Image upload adapters and clipboard paste.
- Reactions tied to collaboration presence.
- Live cursor rendering, participant roster, and presenter/follow mode.
- Threaded comment UI and annotation resolution workflows.
- Object grouping, alignment guides, snap lines, lock/unlock UI.
- Layer panel and frame navigation.
- Read-only / view-only modes per collaborator.
- Version history and board restore.
- Teams/Classroom assignment-specific sharing policy hooks.

## SDK Design Notes

- The whiteboard remains network-free. Hosts own authentication, storage, room membership, and WebSocket transport.
- Deltas are JSON-safe and can be sent through the existing collaboration layer.
- Image elements store `src`; hosts should replace local uploads with durable URLs before long-term persistence.
- The UI is intentionally plain DOM/SVG. React/Vue/Svelte hosts can mount it without a framework bridge.
