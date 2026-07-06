// Public surface of the Future Readiness engine.
// Import FutureReadinessService (+ interfaces) from here; internals stay private.
export { FutureReadinessService } from './futureReadinessService';
export { InMemorySnapshotStore } from './historicalComparison';
export type {
  IFutureReadinessService,
  IReadinessSnapshotStore,
  FutureReadinessSnapshot,
  ReadinessInput,
} from './interfaces';
