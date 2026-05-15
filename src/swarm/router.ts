// ============================================================
// Q-Learning Router — Dynamic Agent Topology
// ============================================================
//
// Routes tasks to the optimal agent topology based on task type.
// Uses a lightweight Q-learning approach: tracks which agent
// combinations produce the best outcomes and adjusts routing.
// ============================================================

import {
  type AgentType,
  type SwarmTopology,
  type PatternQuery,
  type PatternSource,
} from '../types.js';

interface RouteAction {
  agents: AgentType[];
  topology: SwarmTopology;
}

interface QState {
  taskType: string; // e.g. "search", "submit", "interpret"
  sources: string;  // comma-joined source set
  complexity: 'simple' | 'medium' | 'complex';
}

/** Q-table entry */
interface QEntry {
  stateKey: string;
  actionKey: string;
  q: number;        // Q-value
  visits: number;   // visit count for exploration
}

let _qTable: QEntry[] = [];
const EXPLORATION_RATE = 0.1;
const LEARNING_RATE = 0.7;
const DISCOUNT_FACTOR = 0.9;

/** All available agents mapped by capability */
const AGENT_CAPABILITIES: Record<string, AgentType[]> = {
  research: ['scout-pinterest', 'scout-dribbble', 'scout-behance', 'scout-figma'],
  vision: ['vision-layout', 'vision-interpret', 'vision-color', 'vision-typography'],
  pattern: ['curator', 'code-gen', 'quality-gate'],
};

/** Default routes per task type */
const DEFAULT_ROUTES: Record<string, RouteAction> = {
  search: {
    agents: ['curator', 'quality-gate'],
    topology: 'mesh',
  },
  submit_pinterest: {
    agents: ['scout-pinterest', 'vision-layout', 'vision-interpret', 'vision-color', 'vision-typography', 'curator'],
    topology: 'hierarchy',
  },
  submit_dribbble: {
    agents: ['scout-dribbble', 'vision-layout', 'vision-interpret', 'vision-color', 'vision-typography', 'curator'],
    topology: 'hierarchy',
  },
  submit_general: {
    agents: ['vision-layout', 'vision-interpret', 'vision-color', 'vision-typography', 'curator'],
    topology: 'mesh',
  },
  interpret: {
    agents: ['vision-layout', 'vision-interpret', 'vision-color', 'vision-typography'],
    topology: 'mesh',
  },
  codegen: {
    agents: ['code-gen', 'quality-gate'],
    topology: 'ring',
  },
  rate: {
    agents: ['quality-gate'],
    topology: 'star',
  },
};

// ============================================================
// Public API
// ============================================================

/** Get the optimal route for a given task */
export function getRoute(
  taskType: string,
  sources?: PatternSource[],
  complexity: 'simple' | 'medium' | 'complex' = 'medium'
): RouteAction {
  const state: QState = {
    taskType,
    sources: sources?.sort().join(',') ?? '',
    complexity,
  };

  const stateKey = encodeState(state);

  // Try to find best Q-value action
  const relevantEntries = _qTable.filter(e => e.stateKey === stateKey);
  if (relevantEntries.length > 0 && Math.random() > EXPLORATION_RATE) {
    // Exploit: pick best known action
    const best = relevantEntries.reduce((a, b) => a.q > b.q ? a : b);
    return parseActionKey(best.actionKey);
  }

  // Explore or no data: use default route
  return getDefaultRoute(taskType, sources);
}

/** Record the outcome of a route choice (reward) */
export function recordOutcome(
  taskType: string,
  sources: PatternSource[] | undefined,
  complexity: 'simple' | 'medium' | 'complex',
  agents: AgentType[],
  topology: SwarmTopology,
  reward: number // 0-1 (e.g. qualityScore/10)
): void {
  const state: QState = { taskType, sources: sources?.sort().join(',') ?? '', complexity };
  const stateKey = encodeState(state);
  const actionKey = encodeAction({ agents, topology });

  const existing = _qTable.find(e => e.stateKey === stateKey && e.actionKey === actionKey);

  if (existing) {
    // Q-learning update
    const maxFutureQ = Math.max(
      ..._qTable
        .filter(e => e.stateKey === stateKey)
        .map(e => e.q),
      0
    );
    existing.q += LEARNING_RATE * (reward + DISCOUNT_FACTOR * maxFutureQ - existing.q);
    existing.visits++;
  } else {
    _qTable.push({ stateKey, actionKey, q: reward, visits: 1 });
  }

  // Prune Q-table if too large
  if (_qTable.length > 500) {
    _qTable.sort((a, b) => b.visits - a.visits);
    _qTable = _qTable.slice(0, 500);
  }
}

/** Get Q-table size */
export function qTableSize(): number {
  return _qTable.length;
}

/** Get all default routes */
export function getDefaultRoutes(): Record<string, RouteAction> {
  return { ...DEFAULT_ROUTES };
}

// ============================================================
// Internal
// ============================================================

function encodeState(state: QState): string {
  return `${state.taskType}|${state.sources}|${state.complexity}`;
}

function encodeAction(action: RouteAction): string {
  const agents = [...action.agents].sort().join(',');
  return `${agents}@${action.topology}`;
}

function parseActionKey(key: string): RouteAction {
  const [agents, topology] = key.split('@');
  return {
    agents: agents.split(',').filter(Boolean) as AgentType[],
    topology: topology as SwarmTopology,
  };
}

function getDefaultRoute(taskType: string, sources?: PatternSource[]): RouteAction {
  // Try exact match
  if (DEFAULT_ROUTES[taskType]) return DEFAULT_ROUTES[taskType];

  // Try source-based
  if (sources && sources.length > 0) {
    for (const s of sources) {
      const key = `submit_${s}`;
      if (DEFAULT_ROUTES[key]) return DEFAULT_ROUTES[key];
    }
  }

  // Fallback
  return DEFAULT_ROUTES.submit_general;
}
