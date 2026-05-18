// ============================================================
// MCP Resources — Readable Data Sources
// ============================================================
//
// Exposes the pattern library as MCP resources that clients
// can read directly without calling tools.
// ============================================================

export interface ResourceDef {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export function buildResources(): ResourceDef[] {
  return [
    {
      uri: 'dpm://catalog',
      name: 'Pattern Catalog',
      description: 'Complete catalog of all design patterns in the library. Returns up to 50 patterns with full metadata.',
      mimeType: 'application/json',
    },
    {
      uri: 'dpm://stats',
      name: 'Library Statistics',
      description: 'Statistics about the design pattern library including total patterns, source breakdown, top layouts, top components, and learning engine stats.',
      mimeType: 'application/json',
    },
  ];
}
