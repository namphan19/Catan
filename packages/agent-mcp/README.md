# @hexgame/agent-mcp: an AI agent as a Boschtan player

An MCP server (stdio) that lets an LLM agent such as Claude Code sit at a Boschtan table like a person.
One process is one player. It talks to the game server over the normal WebSocket protocol
(`docs/PROTOCOL.md`), so the agent only sees the redacted view a human in that seat would see.
Every action is checked by the server, so the agent cannot break the rules.

## Setup

The repo's `.mcp.json` registers it as `boschtan` for Claude Code. It is configured by two
environment variables:

| env | default | |
|---|---|---|
| `BOSCHTAN_URL` | `wss://boschtan-server.onrender.com/ws` | `https://host`, `host` or `ws(s)://host/ws` all work |
| `BOSCHTAN_NAME` | `Claude` | display name at the table (1-24 chars) |

The `connect` tool can also change both at runtime. To run several agents at one table, add
more entries to `.mcp.json` with different names.

The session token is saved in `data/agent-mcp/` (git-ignored). If this process restarts, the
first tool call reconnects and takes the same seat back. A connection that drops also reconnects
by itself. While a Render free-tier server is waking up it returns 502 at first, so `connect`
keeps retrying for up to 90 s.

## Tools

| tool | what it does |
|---|---|
| `connect` | connect, or change the server/name; rejoins the last room |
| `create_room`, `join_room`, `lobby` | lobby: create (optionally with strongholds / tidelands, or highlands), join by code, then ready / start / add_bot / kick / avatar / leave |
| `room_status` | seats, who is online, plus the news since the agent last looked |
| `wait_for_turn` | blocks until the agent has something to do (its turn, a discard, an offer to answer), the game ends, or someone chats; `until:'any_change'` waits for any update (e.g. answers to its own offer) |
| `get_state` | own hand, cards and VP; other players' counts; awards, bank, open trade, expansion state |
| `get_board` | ASCII map, every hex with its number and pips, harbors, pieces, the id legend, costs, and the best free spots |
| `list_actions` | the legal actions, grouped and numbered and described in words (a vertex shows its terrains, numbers, pips and harbor) |
| `act` | `{index}` from `list_actions`, or a full engine action (`player` is filled in), used for trades and discards it composes itself |
| `chat` | talk to the table |
| `get_log` | the public history (dice, production, every move) |
| `advisor` | optional second opinion: what the built-in 'hard' bot would do |
| `set_afk` | hand the seat to the server's stand-in bot, or take it back |
| `get_rules` | the rules text (base / strongholds / tidelands / highlands / decisions) |

A typical loop is `wait_for_turn` → `get_state` / `get_board` → `list_actions` → `act`, repeated.
Humans are slow, so `wait_for_turn` waits up to 120 s by default (max 600) and can simply be
called again.

## Tests

- `corepack pnpm --filter @hexgame/agent-mcp test`: unit tests for the text rendering.
- `node ../../node_modules/tsx/dist/cli.mjs test/smoke.ts ws://localhost:8080/ws 300` (from this
  folder, with a server running): it starts the MCP server over stdio like a host would, creates
  a room with two bots and plays through the tools only. That includes a player trade, discards
  and, given enough moves, a full game. Set `VERBOSE=1` to print every tool reply.
