import { FutureReadinessResult, ReadinessTrend, PackId, ReadinessTrendDirection } from '../../types/futureReadiness';
import {
  IHistoricalComparisonService,
  IReadinessSnapshotStore,
  FutureReadinessSnapshot,
} from './interfaces';

function direction(delta: number): ReadinessTrendDirection {
  if (delta >= 3) { return 'improving'; }
  if (delta <= -3) { return 'declining'; }
  return 'stable';
}

function makeTrend(packId: PackId | 'overall', current: number, previous: number): ReadinessTrend {
  const delta = current - previous;
  return { packId, current, previous, delta, direction: direction(delta) };
}

/** In-memory snapshot store — the default for tests / when no persistence is wired. */
export class InMemorySnapshotStore implements IReadinessSnapshotStore {
  private snapshot: FutureReadinessSnapshot | undefined;
  load(): FutureReadinessSnapshot | undefined {
    return this.snapshot;
  }
  save(snapshot: FutureReadinessSnapshot): void {
    this.snapshot = snapshot;
  }
}

/**
 * Compares the current readiness result to the last persisted snapshot and
 * records the new one. Mirrors the Assessment Context Engine's TrendAnalyzer.
 */
export class HistoricalComparisonService implements IHistoricalComparisonService {
  constructor(private readonly store: IReadinessSnapshotStore) {}

  compare(current: FutureReadinessResult): ReadinessTrend[] {
    const previous = this.store.load();
    if (!previous) { return []; }

    const trends: ReadinessTrend[] = [makeTrend('overall', current.overall.score, previous.overall)];

    for (const pack of current.packs) {
      const prev = previous.packScores[pack.packId];
      if (prev === undefined) { continue; }
      trends.push(makeTrend(pack.packId, pack.overallScore, prev));
    }

    return trends;
  }

  record(current: FutureReadinessResult): void {
    const packScores: Partial<Record<PackId, number>> = {};
    for (const pack of current.packs) {
      packScores[pack.packId] = pack.overallScore;
    }
    this.store.save({ generatedAt: current.generatedAt, overall: current.overall.score, packScores });
  }
}
