// ============================================================
// Q-Learning Router — Dynamic Agent Topology with Persistence
// ============================================================
//
// Routes tasks to the optimal agent topology based on task type.
// Uses a lightweight Q-learning approach: tracks which agent
// combinations produce the best outcomes and adjusts routing.
// Persists state to disk so learning survives restarts.
// ============================================================

import {
  type AgentType,
  type SwarmTopology,
  type PatternQuery,
  type PatternSource,
} from '../types.js';
import { getPatternStorageDir } from '../storage/local.js';
import { createLogger_Scoped } from '../logging/index.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const logger = createLogger_Scoped('router');

interface RouteAction {
  agents: AgentType[];
  topology: SwarmTopology;
}

interface QState {
  taskType: string;
  sources: string;
  complexity: 'simple' | 'medium' | 'complex';
}

interface QEntry {
  stateKey: string;
  actionKey: string;
  q: number;
  visits: number;
}

let _qTable: QEntry[] = [];
let _stateLoaded = false;
const EXPLORATION_RATE = 0.1;
const LEARNING_RATE = 0.7;
const DISCOUNT_FACTOR = 0.9;

/** Default routes per task type */
const DEFAULT_ROUTES: Record<string, RouteAction> = {
  search: { agents: ['curator', 'quality-gate'], topology: 'mesh' },
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
  codegen: { agents: ['code-gen', 'quality-gate'], topology: 'ring' },
  rate: { agents: ['quality-gate'], topology: 'star' },
};

function _getStatePath(): string {
  const storageDir = getPatternStorageDir();
  return join(storageDir, 'router-state.json');
}

function _loadState(): void {
  if (_stateLoaded) return;
  _stateLoaded = true;

  try {
    const path = _getStatePath();
    if (!existsSync(path)) return;

    const raw = readFileSync(path, 'utf-8');
    const persisted = JSON.parse(raw) as { qTable: QEntry[] };

    if (Array.isArray(persisted.qTable)) {
      _qTable = persisted.qTable;
      logger.info({ entries: _qTable.length }, 'Router Q-table loaded from disk');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message }, 'Failed to load router state, starting fresh');
  }
}

function _saveState(): void {
  try {
    const path = _getStatePath();
    const storageDir = getPatternStorageDir();

    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true });
    }

    writeFileSync(path, JSON.stringify({ qTable: _qTable }, null, 2), 'utf-8');
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'Failed to save router state');
  }
}

// ============================================================
// Public API
// ============================================================

/** Initialize router — loads persisted Q-table */
export function initRouter(): void {
  _loadState();
}

/** Get the optimal route for a given task */
export function getRoute(
  taskType: string,
  sources?: PatternSource[],
  complexity: 'simple' | 'medium' | 'complex' = 'medium'
): RouteAction {
  _loadState();

  const state: QState = { taskType, sources: sources?.sort().join(',') ?? '', complexity };
  const stateKey = encodeState(state);

  const relevantEntries = _qTable.filter(e => e.stateKey === stateKey);
  if (relevantEntries.length > 0 && Math.random() > EXPLORATION_RATE) {
    const best = relevantEntries.reduce((a, b) => a.q > b.q ? a : b);
    return parseActionKey(best.actionKey);
  }

  return getDefaultRoute(taskType, sources);
}

/** Record the outcome of a route choice (updates Q-table and persists) */
export function recordOutcome(
  taskType: string,
  sources: PatternSource[] | undefined,
  complexity: 'simple' | 'medium' | 'complex',
  agents: AgentType[],
  topology: SwarmTopology,
  reward: number
): void {
  _loadState();

  const state: QState = { taskType, sources: sources?.sort().join(',') ?? '', complexity };
  const stateKey = encodeState(state);
  const actionKey = encodeAction({ agents, topology });

  const existing = _qTable.find(e => e.stateKey === stateKey && e.actionKey === actionKey);

  if (existing) {
    const maxFutureQ = Math.max(
      ..._qTable.filter(e => e.stateKey === stateKey).map(e => e.q),
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

  _saveState();
  logger.debug({ taskType, reward, visits: _qTable.length }, 'Q-table updated');
}

/** Get Q-table size */
export function qTableSize(): number {
  return _qTable.length;
}

/** Get all default routes */
export function getDefaultRoutes(): Record<string, RouteAction> {
  return { ...DEFAULT_ROUTES };
}

/** Get router stats for diagnostics */
export function getRouterStats(): { entries: number; totalVisits: number } {
  return {
    entries: _qTable.length,
    totalVisits: _qTable.reduce((sum, e) => sum + e.visits, 0),
  };
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
  if (DEFAULT_ROUTES[taskType]) return DEFAULT_ROUTES[taskType];

  if (sources && sources.length > 0) {
    for (const s of sources) {
      const key = `submit_${s}`;
      if (DEFAULT_ROUTES[key]) return DEFAULT_ROUTES[key];
    }
  }

  return DEFAULT_ROUTES.submit_general;
}
