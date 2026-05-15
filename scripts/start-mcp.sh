#!/bin/bash
# ============================================================
# Design Pattern Multiverse — MCP Server Startup (Unix/macOS/Linux)
# ============================================================

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║ Design Pattern Multiverse — MCP Server Startup    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    echo "  Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js${NC} $NODE_VERSION"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm is not installed${NC}"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo -e "${GREEN}✓ npm${NC} v$NPM_VERSION"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠ Installing dependencies...${NC}"
    npm install
fi

# Build if needed
if [ ! -d "dist" ]; then
    echo -e "${YELLOW}⚠ Building project...${NC}"
    npm run build
    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Build failed${NC}"
        exit 1
    fi
fi

# Check that dist/mcp-server/index.js exists
if [ ! -f "dist/mcp-server/index.js" ]; then
    echo -e "${RED}✗ MCP server build not found${NC}"
    echo "  Run: npm run build"
    exit 1
fi

echo -e "${YELLOW}⚠ Starting MCP server...${NC}"
echo ""

# Start the MCP server
exec node dist/mcp-server/index.js
