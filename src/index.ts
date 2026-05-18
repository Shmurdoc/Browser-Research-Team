// ============================================================
// Design Pattern Multiverse — Core Library
// ============================================================

export * from './types.js';

export {
  putPattern,
  getPattern,
  deletePattern,
  searchPatterns,
  addFeedback,
  getStats,
  getAllIds,
  loadAllPatterns,
  _resetCache,
  getStorageDir,
} from './storage/local.js';

export {
  indexPattern,
  removeFromIndex,
  searchVectors,
  rebuildIndex,
  indexSize,
  isEmbeddingModelLoaded,
  getEmbeddingStatus,
} from './memory/agentdb.js';

export {
  initSONA,
  learnFromFeedback,
  predictQuality,
  getSONAStats,
  setAdaptationRate,
  resetSONA,
} from './memory/sona.js';

export {
  initReasoningBank,
  recordTrace,
  findSimilarTraces,
  getImportantMemories,
  getEWCPenalty,
  decayMemories,
  getReasoningStats,
  resetReasoningBank,
} from './memory/reasoning-bank.js';

export {
  reachConsensus,
  updateTrust,
  getAgentTrust,
  getAgentTrusts,
  resetTrust,
  type ConsensusResult,
  type ConsensusDecision,
} from './consensus/weighted-vote.js';

export {
  initRouter,
  getRoute,
  recordOutcome,
  qTableSize,
  getDefaultRoutes,
  getRouterStats,
} from './swarm/router.js';

export {
  scoutAll,
  scoutSource,
} from './swarm/scout/index.js';

export {
  interpretSubmission,
  analyzeImage,
} from './swarm/vision/index.js';

export {
  assignTaxonomy,
  computeSimilarity,
  isDuplicate,
  mergePatterns,
} from './swarm/pattern/curator.js';

export {
  generateCode,
} from './swarm/pattern/code-gen.js';

export {
  assessQuality,
  passesQualityGate,
} from './swarm/pattern/quality-gate.js';

export { hasOpenAIKey, hasMcpAuth, config } from './config.js';

export {
  validateURL,
  sanitizeURL,
} from './validation/url.js';

export {
  sanitizeXSS,
  sanitizeSQLInjection,
  sanitizePathTraversal,
  sanitizeInput,
  sanitizeObject,
  safeBasename,
  sanitizePromptInjection,
} from './validation/sanitize.js';

export {
  downloadAndProcessImage,
  extractColorPalette,
  getImagePath,
  readImageFile,
  imageToDataUrl,
  deletePatternImages,
} from './utils/image-pipeline.js';
