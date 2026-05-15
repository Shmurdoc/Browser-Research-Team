# Design Pattern Multiverse

A self-learning multi-agent system that researches design patterns from the internet, interprets UI/UX through computer vision, catalogs them into a living pattern library, and recursively improves using swarm intelligence.

> Built with **gstack** (Garry Tan's sprint methodology) and **ruflo** (multi-agent swarm orchestration with SPARC methodology, Raft consensus, and SONA self-learning).

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

---

## Quick Start

```bash
# Install
npm install -g design-pattern-multiverse

# Seed the library with example patterns
dpm seed

# Search for patterns
dpm search "dark mode dashboard"

# Discover patterns from the internet
dpm discover "SaaS landing page" --save

# Generate component code
dpm code <pattern-id> --framework react

# Rate a pattern (triggers self-learning)
dpm rate <pattern-id> --rating 4 --tags "modern,clean,useful"
```

---

## MCP Server — OpenCode Integration

The primary interface is the **MCP server**, which exposes the pattern library and AI agents as tools that any MCP-compatible client (OpenCode, Claude Code, etc.) can use.

### Setup for OpenCode

Add this to your OpenCode `mcpServers` configuration (typically in `~/.opencode/settings.json` or `claude.json`):

```json
{
  "mcpServers": {
    "design-pattern-multiverse": {
      "command": "npx",
      "args": ["-y", "design-pattern-multiverse"],
      "env": {
        "DPM_STORAGE_DIR": "path/to/patterns"
      }
    }
  }
}
```

Or for a local build:

```json
{
  "mcpServers": {
    "design-pattern-multiverse": {
      "command": "node",
      "args": ["path/to/design-pattern-multiverse/dist/mcp-server/index.js"]
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `search_patterns` | Search the design pattern library with natural language |
| `discover_patterns` | Research the internet (Pinterest, Dribbble, Behance, Figma) |
| `submit_pattern` | Save a discovered pattern into the library with vision interpretation |
| `get_pattern` | Get full pattern details by ID |
| `rate_pattern` | Rate a pattern and trigger SONA self-learning |
| `generate_code` | Generate React/Vue component code from a pattern |
| `catalog_stats` | Get library and learning statistics |
| `suggest_patterns` | AI-powered suggestions based on project context |

### Example Usage in OpenCode

Once connected, you can ask your AI coding assistant:

> "Search for dark mode dashboard patterns"
> → Calls `search_patterns`

> "Find me some modern pricing page designs from Pinterest"
> → Calls `discover_patterns`

> "Generate a React component for this pattern pat_seed_abc123"
> → Calls `generate_code`

> "Rate this pattern 4 stars and mark it as modern"
> → Calls `rate_pattern`

---

## CLI Reference

```bash
dpm search <query>             # Search the pattern library
dpm discover <query>           # Research the internet for design patterns
dpm submit                     # Submit a new pattern (with options)
dpm get <id>                   # Get pattern details
dpm rate <id> --rating <1-5>   # Rate and trigger learning
dpm code <id>                  # Generate component code
dpm suggest <context>          # AI-powered suggestions
dpm stats                      # Library statistics
dpm seed                       # Seed with example patterns
dpm --help                     # Full help
```

---

## Architecture

```
                          ┌─────────────────────────────────┐
                          │      User / MCP Client           │
                          │  (OpenCode, Claude Code, CLI)    │
                          └──────────────┬──────────────────┘
                                         │
                          ┌──────────────▼──────────────────┐
                          │   Q-Learning Router              │
                          │   Dynamic agent topology          │
                          └──┬──────────┬──────────┬─────────┘
                             │          │          │
                ┌────────────▼──┐  ┌────▼─────┐  ┌▼────────────┐
                │ Scout Swarm   │  │ Vision   │  │ Pattern      │
                │ (4 agents)    │  │ Swarm    │  │ Library      │
                │               │  │ (4 agents)│  │ Swarm        │
                │ • Pinterest   │  │ • DETR   │  │ (2 agents)   │
                │ • Dribbble    │  │ • CLIP   │  │              │
                │ • Behance     │  │ • BLIP2  │  │ • Curator    │
                │ • Figma       │  │ • Color  │  │ • Code Gen   │
                └───────────────┘  │ • Typo   │  └──────────────┘
                                   └──────────┘
                             │          │               │
                             └──────────┴───────────────┘
                                         │
                          ┌──────────────▼──────────────────┐
                          │     Memory Layer                 │
                          │  • AgentDB (HNSW vector memory)  │
                          │  • SONA (self-learning engine)   │
                          │  • ReasoningBank (EWC++)         │
                          └──────────────────────────────────┘
                                         │
                          ┌──────────────▼──────────────────┐
                          │     Consensus (Raft)              │
                          │  3/4 majority prevents hallucination│
                          └──────────────────────────────────┘
```

### Layers

1. **Scout Swarm** — Internet research agents that query Pinterest, Dribbble, Behance, and Figma Community for design inspiration
2. **Vision Swarm** — Image interpretation agents using computer vision to extract layout, components, colors, and typography
3. **Pattern Library Swarm** — Curator deduplicates and taxonomises, Code-Gen generates framework components, Quality-Gate scores 0-10
4. **Memory Layer** — AgentDB provides vector search via HNSW index, SONA learns from feedback, ReasoningBank stores successful patterns with EWC++ against forgetting
5. **Consensus** — Raft-inspired majority voting prevents hallucinated patterns

### Self-Learning Loop

```
User rates ★★★★☆
       │
       ▼
SONA neural pattern matcher
       │
       ▼
ReasoningBank stores (embedding, rating, tags, timestamp)
       │
       ▼
EWC++ prevents catastrophic forgetting
       │
       ▼
Q-Learning Router adjusts agent topology for future patterns
       │
       ▼
Scout Swarm prioritizes sources that produced high-rated patterns
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PIN_API_KEY` | Pinterest API key (v5) for real Pinterest data |
| `FIGMA_ACCESS_TOKEN` | Figma API token for Figma Community search |
| `DPM_STORAGE_DIR` | Pattern storage directory (default: ./patterns) |
| `SUPABASE_URL` | Supabase URL for optional cloud sync |
| `SUPABASE_KEY` | Supabase anon key for optional cloud sync |

Without API keys, the system falls back to curated mock design data so you can evaluate the full workflow.

---

## Development

```bash
# Clone and install
git clone <repo>
cd design-pattern-multiverse
npm install

# Build
npm run build

# Run CLI in dev mode
npm run dev -- search "dashboard"

# Run MCP server in dev mode
npm run dev:mcp

# Test
npm test

# Lint
npm run lint
```

---

## Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Orchestration | ruflo swarm + gstack sprints | Multi-agent + build lifecycle |
| Agents | Specialized TypeScript modules | 10 agents across 3 swarms |
| Vision | DETR, CLIP, BLIP2 (scaffolded) | Image interpretation |
| Vector Memory | AgentDB (HNSW + cosine similarity) | Sub-ms pattern retrieval |
| Learning | SONA + ReasoningBank + EWC++ | Persistent improvement |
| Consensus | Raft (3/4 majority) | Anti-hallucination |
| MCP Protocol | `@modelcontextprotocol/sdk` | OpenCode integration |
| Storage | Local JSON + optional Supabase | Pattern persistence |

---

## Roadmap

- [x] Core architecture: swarms, memory, consensus, MCP
- [x] MCP server with 8 tools for OpenCode
- [x] CLI tool with search, discover, submit, rate, code-gen
- [x] Self-learning loop (SONA + ReasoningBank + EWC++)
- [x] Multi-source internet research (Pinterest, Dribbble, Behance, Figma)
- [ ] Real DETR/CLIP model integration for production vision
- [ ] Web UI dashboard
- [ ] Figma plugin (Phase 3)
- [ ] Full design-to-code generation (Phase 2)

---

## License

MIT — built with gstack and ruflo.
