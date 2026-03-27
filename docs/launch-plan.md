# Launch Plan

## Positioning

AISnitch is not another "launch agents through my app" wrapper.

The message to keep repeating:

- passive observer, not workflow lock-in
- one live stream across many AI coding tools
- local-first and privacy-first
- good enough for a TUI today, useful for mascots/dashboards tomorrow

## Draft launch copy

### Hacker News

Title:

`Show HN: AISnitch – a live event bridge for Claude Code, OpenCode, Gemini CLI, Codex, Goose and more`

Body:

`I wanted one local stream of AI coding activity without having to launch every tool through another manager, so I built AISnitch. It listens to hooks, logs, transcripts, and process fallbacks, normalizes everything into CloudEvents, and exposes a localhost WebSocket stream plus a terminal TUI. Current adapters cover Claude Code, OpenCode, Gemini CLI, Codex, Goose, Copilot CLI, Aider, OpenClaw, and a generic PTY fallback. No SQLite, no cloud, no replay: events are live-only and dropped after transit.`

### Reddit

`AISnitch is a local observability bridge for AI coding tools. Instead of wrapping your workflow, it passively watches hooks/logs/processes and streams normalized events to a TUI or any WebSocket consumer. Useful if you bounce between Claude Code, OpenCode, Gemini CLI, Codex, Goose, etc.`

### X / Twitter

`Built AISnitch: a local event bridge for AI coding tools. Hooks + transcripts + process fallbacks -> one live WebSocket stream + TUI. Claude Code, OpenCode, Gemini CLI, Codex, Goose, Copilot CLI, Aider, OpenClaw, PTY fallback. Privacy-first: no persisted event store in the MVP.`

### Dev.to article outline

1. Why existing tools are mostly Claude-only
2. Why passive monitoring matters more than launcher lock-in
3. Hook vs log vs process interception
4. Building a CloudEvents bridge for AI tools
5. What adapters taught us about tool fragmentation

## Manual launch checklist

- Record the final GIF demo from the real TUI flow
- Validate the copy tone with the maintainer
- Publish npm package
- Push the Homebrew tap formula
- Post the launch threads
