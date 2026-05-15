# Quick Start: Using Design Pattern Multiverse in OpenCode

Get up and running with Design Pattern Multiverse in 5 minutes.

## Prerequisites

- **OpenCode** installed and configured
- **Node.js** 18.0.0 or higher
- **npm** 9.0.0 or higher

Check your versions:
```bash
node --version
npm --version
```

## Installation Steps

### 1. Add Package to Your Project

If you're using Design Pattern Multiverse in a project, install the package:

```bash
npm install @browserresearchteam/design-pattern-multiverse
```

Or for global MCP plugin use, ensure it's available on your system.

### 2. Configure OpenCode to Load the MCP Plugin

OpenCode looks for MCP server configurations. Add Design Pattern Multiverse to your configuration file.

**Location**: Typically one of:
- `.opencode/config.json`
- `~/.opencode/settings.json`
- Your OpenCode settings UI

**Configuration**:
```json
{
  "mcp": {
    "servers": {
      "design-pattern-multiverse": {
        "command": "node",
        "args": [
          "path/to/node_modules/@browserresearchteam/design-pattern-multiverse/dist/mcp-server/index.js"
        ],
        "env": {
          "DPM_LOG_LEVEL": "info",
          "DPM_STORAGE_DIR": "./patterns"
        }
      }
    }
  }
}
```

If you cloned the repo locally:
```json
{
  "command": "npm",
  "args": ["run", "mcp-start"],
  "cwd": "/path/to/design-pattern-multiverse"
}
```

### 3. Restart OpenCode

After configuration, restart OpenCode. You should see Design Pattern Multiverse tools available.

## First Commands

Try these prompts in OpenCode:

### Search for Design Patterns

```
Find me button design patterns
```

Returns patterns from your local library with layout, colors, and component info.

### Generate React Component

```
Generate a React button component from pattern pat_abc123
```

Produces production-ready component code.

### Discover Patterns Online

```
Research modern SaaS landing pages from all sources
```

Searches Pinterest, Dribbble, Behance, and Figma Community.

### Get Smart Suggestions

```
I'm building a fintech dashboard. What design patterns would work well?
```

Returns recommended patterns based on your context.

### Rate a Pattern

```
Give pattern pat_abc123 5 stars - it's modern and clean
```

Your rating helps the system learn and improve recommendations.

### View Statistics

```
Show me library statistics
```

See how many patterns you've collected and learning progress.

## Example Workflow

```
User: "Find dashboard design patterns with dark mode"
↓
Assistant calls: search_patterns("dashboard dark mode", limit=10)
↓
Returns: 10 patterns with layout, colors, components, quality scores
↓
User: "Generate a React component from pattern pat_xyz"
↓
Assistant calls: generate_code("pat_xyz", framework="react")
↓
Returns: React component code with TypeScript types + Tailwind CSS
↓
User: "That's great! Rate it 5 stars"
↓
Assistant calls: rate_pattern("pat_xyz", 5, "modern and clean")
↓
System learns from your feedback
```

## Available Tools

| Tool | Use For | Example |
|------|---------|---------|
| **search_patterns** | Find patterns in your library | "Find dark mode buttons" |
| **discover_patterns** | Research internet design sources | "Research pricing pages" |
| **submit_pattern** | Save a found pattern to library | After discovering, save it |
| **get_pattern** | View pattern details | See full pattern data |
| **rate_pattern** | Rate and provide feedback | "5 stars, very modern" |
| **generate_code** | Create React/Vue components | "Generate React code" |
| **catalog_stats** | View library statistics | "Show statistics" |
| **suggest_patterns** | Get smart recommendations | "I'm building a dashboard" |

## Configuration Options

### Environment Variables

Create a `.env` file in your project root:

```env
# Logging (default: info)
DPM_LOG_LEVEL=info

# Storage location (default: ./patterns)
DPM_STORAGE_DIR=./patterns

# Optional: External API Keys
PIN_API_KEY=your_pinterest_key
FIGMA_API_KEY=your_figma_token
FIGMA_ACCESS_TOKEN=your_figma_token  # alias for FIGMA_API_KEY
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

**Note**: Without API keys, the system works offline with your local library.

## Troubleshooting

### "Design Pattern Multiverse tools not available"

1. **Check OpenCode configuration** — Verify the MCP plugin is configured correctly
2. **Check Node.js** — Ensure you have Node.js 18+
3. **Check logs** — Look in `logs/dpm-*.log` for errors
4. **Restart OpenCode** — Sometimes required after config changes

### "No patterns found"

1. Patterns must first be discovered or submitted
2. Try: `discover_patterns("dashboard", sources="dribbble")`
3. Then submit them: `submit_pattern(...)`

### "Code generation failed"

1. Pattern must have layout and component information
2. Try: `get_pattern(pattern_id)` to verify pattern is complete
3. Submit higher-quality patterns with detailed descriptions

### Enable Debug Logging

```env
DPM_LOG_LEVEL=debug
```

Then check `logs/` directory for detailed output.

## Next Steps

1. **Explore the Library** — Search for patterns matching your project
2. **Generate Components** — Create React/Vue code from patterns
3. **Build Your Library** — Discover and save patterns you love
4. **Rate Patterns** — Help the system learn your preferences
5. **Get Suggestions** — Describe your project and get recommendations

## Full Documentation

See [OPENCODE_INTEGRATION.md](./OPENCODE_INTEGRATION.md) for comprehensive documentation including:
- Complete API reference
- Configuration details
- Security considerations
- Advanced usage patterns

## Support & Feedback

- Issues? Check `logs/dpm-*.log`
- Questions? See [OPENCODE_INTEGRATION.md](./OPENCODE_INTEGRATION.md)
- Bug reports? Visit GitHub

Happy building! 🚀
