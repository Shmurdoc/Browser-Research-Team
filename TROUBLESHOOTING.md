# Troubleshooting Guide — Design Pattern Multiverse

## Common Issues & Debug Steps

### 1. Storage Issues

**Problem**: Patterns are not being saved
```bash
# Debug: Enable verbose logging
DPM_LOG_LEVEL=debug dpm search "test"

# Check storage directory
ls -la patterns/
ls -la patterns/index.json
```

**Solution**: Ensure storage directory has write permissions
```bash
chmod 755 patterns/
```

---

### 2. Scout API Failures

**Problem**: Scout agents are failing silently
```bash
# Enable debug logging to see retry attempts
DPM_LOG_LEVEL=debug dpm discover "dashboard"
```

**Solution**: Check API keys are set
```bash
export PIN_API_KEY=your_api_key
export DRIBBBLE_API_KEY=your_api_key
```

The system automatically falls back to mock data if API keys are missing.

---

### 3. Vision Agent Failures

**Problem**: Vision pipeline has low confidence scores
```
layoutConfidence: 0
elementsConfidence: 0
colorsConfidence: 0
typographyConfidence: 0
```

**Solution**: This is expected for mock submissions (test mode). In production with real images:
- Ensure images are at least 640x480 pixels
- Check image formats (PNG, JPG supported)
- Verify image URLs are accessible

---

### 4. Performance Issues

**Problem**: Search is slow
```bash
# Check vector index size
du -sh patterns/

# Monitor memory usage while searching
DPM_LOG_LEVEL=debug dpm search --verbose "dashboard" 2>&1 | grep "Duration\|memory"
```

**Solution**: If vector index is >100MB, consider filtering by layout type:
```bash
dpm search "dashboard" --layout dashboard
```

---

### 5. Rate Limiting

**Problem**: Getting rate limit errors
```
Rate limit exceeded for api:pinterest. Please retry after 60000ms
```

**Solution**: Adjust rate limit configuration
```bash
# Default: 100 requests per minute
export DPM_RATE_LIMIT_PER_MINUTE=200
```

---

### 6. Logging Issues

**Problem**: Not seeing logs where expected
```bash
# Check log level (default: info in production, debug in dev)
echo $DPM_LOG_LEVEL

# Check log directory permissions
ls -la logs/
```

**Solution**: Set log level and ensure directory exists
```bash
export DPM_LOG_LEVEL=debug
export DPM_LOG_DIR=./my-logs
mkdir -p $DPM_LOG_DIR
dpm search "test"
```

---

### 7. Validation Errors

**Problem**: CLI shows "Invalid input" errors
```
Error: Invalid input for query: Search text must be at least 2 characters
```

**Solution**: Use shorter, simpler queries
```bash
# ❌ Too short
dpm search "a"

# ✅ Good
dpm search "dashboard"
```

---

### 8. Memory Issues

**Problem**: System runs out of memory
```bash
# Check loaded patterns
dpm stats

# Monitor memory during search
top -p $(pgrep -f "dpm search")
```

**Solution**: Clear old patterns or use paging
```bash
# Search with smaller result sets
dpm search "dashboard" --limit 5

# Use offset for pagination
dpm search "dashboard" --limit 10 --offset 10
```

---

### 9. Testing Issues

**Problem**: Tests fail with "Cannot find module" errors
```bash
# Rebuild before running tests
npm run build
npm test
```

**Solution**: Tests import from compiled dist/. Always rebuild after source changes.

---

### 10. MCP Server Issues

**Problem**: MCP server won't start
```bash
dpm-mcp
# Error: Cannot find module
```

**Solution**: Ensure dist/ exists and build is current
```bash
npm run build
npm run mcp
```

---

## Debug Logging

### Enable Full Debug Tracing

```bash
# All components at debug level
DPM_LOG_LEVEL=debug dpm search "dashboard"

# Output to file
DPM_LOG_LEVEL=debug DPM_LOG_DIR=/tmp dpm search "dashboard"
tail -f /tmp/dpm-*.log
```

### Log Structure

Logs include structured context:
```json
{
  "level": "info",
  "time": "2026-05-14T10:30:00.000Z",
  "scope": "scout:orchestrator",
  "msg": "All scouts completed",
  "total": 42,
  "sources": 4
}
```

---

## Performance Profiling

### Vector Search Latency

```bash
# Check vector search performance
DPM_LOG_LEVEL=info dpm search "dashboard" | grep "Duration\|latency"

# Expected: <10ms for 1000 patterns
```

### Memory Usage

```bash
# Get pattern count
dpm stats | grep "totalPatterns"

# Estimate memory: ~1KB per pattern + embeddings (~1.5KB per pattern)
```

---

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `SCOUT_ERROR` | Scout fetch failed | Check API keys, network connectivity |
| `VISION_ERROR` | Vision agent failed | Check image quality, retry |
| `STORAGE_ERROR` | File operations failed | Check permissions, disk space |
| `VALIDATION_ERROR` | Input validation failed | Use valid inputs, check types |
| `CONSENSUS_ERROR` | Raft voting failed | Retry operation |
| `RATE_LIMIT_ERROR` | API rate limit exceeded | Wait before retrying |
| `TIMEOUT_ERROR` | Operation exceeded time limit | Increase timeout or retry |

---

## Getting Help

1. **Check the logs**: `DPM_LOG_LEVEL=debug dpm <command>`
2. **Run tests**: `npm test` to verify system is working
3. **Check GitHub Issues**: https://github.com/anomalyco/opencode
4. **Review examples**: `dpm search "dashboard"` to see sample output

---

## Performance Tips

1. **Use specific filters**
   ```bash
   dpm search "button" --layout dashboard --framework react
   # Better than: dpm search "button"
   ```

2. **Cache results**
   - Pattern library is automatically cached in memory
   - Subsequent searches on same query are instant

3. **Batch operations**
   - Use vector search for bulk discovery
   - Filter results client-side when possible

4. **Monitor logs**
   ```bash
   tail -f logs/dpm-*.log
   ```
