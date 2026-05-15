# Design Pattern Multiverse × OpenCode Integration Guide

## What is Design Pattern Multiverse?

Design Pattern Multiverse (DPM) is an AI-powered design pattern discovery and code generation system that:

- **Researches** the internet for UI/UX design patterns from Pinterest, Dribbble, Behance, and Figma Community
- **Interprets** designs using computer vision to extract layouts, color palettes, typography, and component classifications
- **Catalogs** patterns into a searchable library with semantic indexing
- **Generates** production-ready React and Vue component code from design patterns
- **Learns** from user feedback to improve pattern matching and quality predictions using SONA self-learning

## Use Cases

### 1. Search Design Patterns
Find UI patterns from your library or the internet:
- Dashboard layouts
- Landing pages with specific themes (modern, dark mode, etc.)
- Component patterns (buttons, cards, forms)
- Pricing pages
- Navigation patterns

### 2. Generate React/Vue Components
Convert design patterns into production-ready code:
- React + Tailwind CSS (default)
- Vue with Tailwind
- Alternative styling: CSS Modules, Styled Components, Vanilla CSS
- TypeScript support
- Optional test files

### 3. Discover UI Inspiration
Research live designs from design platforms:
- Search across multiple sources simultaneously
- Save interesting patterns to your local library
- Rate patterns to improve recommendations

### 4. Get Smart Suggestions
Let DPM suggest patterns based on your project context:
- Describe what you're building
- Get recommendations with reasoning
- Learn layout types and components that fit your use case

## Installation

### 1. Install the Package

```bash
npm install @browserresearchteam/design-pattern-multiverse
```

Or add to your `package.json`:
```json
{
  "dependencies": {
    "design-pattern-multiverse": "^0.1.0"
  }
}
```

### 2. Configure OpenCode

Add the MCP plugin to your OpenCode configuration file (typically `.opencode/config.json` or in your OpenCode settings):

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

### 3. Optional: Configure External APIs

Create or update your `.env` file to enable external data sources:

```env
# Optional: Enable specific design platforms
PIN_API_KEY=your_pinterest_api_key
DRIBBBLE_API_KEY=your_dribbble_api_key
BEHANCE_API_KEY=your_behance_api_key
FIGMA_API_KEY=your_figma_access_token
FIGMA_ACCESS_TOKEN=your_figma_access_token  # alias for FIGMA_API_KEY

# Optional: Enable cloud storage
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Logging
DPM_LOG_LEVEL=info
DPM_LOG_DIR=./logs

# Storage
DPM_STORAGE_DIR=./patterns
```

**Note**: API keys are optional. DPM works offline with your local pattern library by default.

## Example Prompts for OpenCode Users

### Search Patterns
```
"Find all button design patterns with a modern style"

"Search for dashboard layouts from Dribbble with dark mode"

"Show me 10 pricing page patterns, minimum quality score 7"
```

### Generate Components
```
"Generate a React button component from pattern pat_abc123"

"Create a Vue component for the dashboard at pat_xyz123 using CSS Modules"

"Generate TypeScript React component with tests for pattern pat_def456"
```

### Discover Patterns
```
"Research modern SaaS landing pages from all sources"

"Find fintech dashboard designs from Figma Community"

"Discover card layout patterns for e-commerce"
```

### Get Suggestions
```
"I'm building a fintech dashboard with real-time data. What patterns would work?"

"Creating a SaaS onboarding flow. Suggest relevant UI patterns."

"What design patterns would fit a dark-themed analytics dashboard?"
```

### Rate & Learn
```
"Rate pattern pat_abc123 as 5 stars, it's modern and clean"

"Give pat_xyz789 a 3-star rating - too complex for my use case"
```

### Get Stats
```
"Show me library statistics"

"How many patterns have we collected? What's the learning progress?"
```

## What You Can Do Now

Once configured, you'll have access to:

| Tool | Purpose | Example |
|------|---------|---------|
| `search_patterns` | Search local library | "dark mode dashboard" |
| `discover_patterns` | Research internet | "modern SaaS UI" |
| `submit_pattern` | Save found patterns | Save Dribbble design |
| `get_pattern` | Retrieve pattern details | View full pattern data |
| `rate_pattern` | Provide feedback | Rate with 5 stars |
| `generate_code` | Create components | React + Tailwind |
| `catalog_stats` | Library overview | Pattern count, sources |
| `suggest_patterns` | Smart recommendations | "fintech dashboard" |

## Troubleshooting

### MCP Server Won't Start

**Check Node.js version:**
```bash
node --version  # Should be 18.0.0 or higher
```

**Check logs:**
```bash
tail -f logs/dpm-*.log
```

**Try verbose mode:**
```bash
DPM_LOG_LEVEL=debug npm run mcp-server
```

### Pattern Search Returns No Results

1. Check that patterns are loaded:
   ```bash
   npm run mcp-server
   # Should output: "Rebuilt vector index with X patterns"
   ```

2. Verify storage directory:
   ```bash
   ls -la patterns/
   ```

3. Try `catalog_stats` to see what's available

### Code Generation Fails

1. Verify pattern exists:
   ```
   Use get_pattern to confirm the pattern_id is valid
   ```

2. Check pattern has required fields:
   - layout information
   - color palette
   - component list

### External API Calls Not Working

If `discover_patterns` returns warnings:
- Some sources may be rate-limited
- Check that API keys are set correctly in `.env`
- See `logs/dpm-*.log` for specific errors

## Configuration Reference

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DPM_LOG_LEVEL` | `info` | Logging level: debug, info, warn, error |
| `DPM_LOG_DIR` | `./logs` | Where to write log files |
| `DPM_STORAGE_DIR` | `./patterns` | Local pattern storage directory |
| `PIN_API_KEY` | - | Pinterest API key (optional) |
| `FIGMA_API_KEY` | - | Figma access token (optional) |
| `FIGMA_ACCESS_TOKEN` | - | Alias for FIGMA_API_KEY (optional) |
| `SUPABASE_URL` | - | Supabase project URL (optional) |
| `SUPABASE_KEY` | - | Supabase anon key (optional) |
| `SONA_ADAPTATION_RATE` | `0.15` | Learning speed (0-1) |

## Security Notes

- **Never commit `.env` to version control** — use `.env.example` as template
- API keys are sensitive — treat like passwords
- Local patterns are stored in `DPM_STORAGE_DIR` — secure this location
- MCP communication uses stdio, which is secure for local connections

## Next Steps

1. Restart OpenCode after configuration
2. You should see Design Pattern Multiverse tools available
3. Try: `search_patterns` with query "button design"
4. Explore other tools and build your design system!

## Support

For issues or feature requests:
- Check the troubleshooting section above
- Review logs: `logs/dpm-*.log`
- See main README.md for architecture details
- Visit: https://github.com/browserresearchteam/design-pattern-multiverse

Happy pattern hunting! 🚀
