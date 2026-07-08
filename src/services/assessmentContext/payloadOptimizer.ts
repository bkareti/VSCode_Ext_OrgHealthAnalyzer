import { AssessmentContext, PayloadOptimizerReport } from '../../types/assessmentContext';
import { IPayloadOptimizer } from './interfaces';

const DEFAULT_BUDGET_TOKENS = 12_000;

/** Maximum items per domain's topFindings array. */
const MAX_FINDINGS_PER_DOMAIN = 10;
const MAX_LICENSE_ITEMS       = 5;
const MAX_QUICK_WINS          = 5;
const MAX_GOV_LIMITS          = 5;

export class PayloadOptimizer implements IPayloadOptimizer {
  estimateTokens(value: unknown): number {
    return Math.ceil(JSON.stringify(value).length / 4);
  }

  optimize(context: AssessmentContext, budgetTokens = DEFAULT_BUDGET_TOKENS): AssessmentContext {
    // Deep clone so the original is never mutated.
    let ctx: AssessmentContext = JSON.parse(JSON.stringify(context)) as AssessmentContext;
    const truncations: string[] = [];

    if (this.estimateTokens(ctx) <= budgetTokens) {
      ctx.optimizerReport = { estimatedTokens: this.estimateTokens(ctx), budget: budgetTokens, truncationsApplied: [] };
      return ctx;
    }

    // Step 1 — cap topFindings per domain.
    for (const group of ctx.findings) {
      if (group.topFindings.length > MAX_FINDINGS_PER_DOMAIN) {
        group.topFindings = group.topFindings.slice(0, MAX_FINDINGS_PER_DOMAIN);
        truncations.push(`findings.${group.domain} capped at ${MAX_FINDINGS_PER_DOMAIN} items`);
      }
    }
    if (this.estimateTokens(ctx) <= budgetTokens) {
      return this.finalize(ctx, budgetTokens, truncations);
    }

    // Step 2 — cap licenseUtilizationSummary.
    if (ctx.licenseUtilizationSummary.length > MAX_LICENSE_ITEMS) {
      ctx.licenseUtilizationSummary = ctx.licenseUtilizationSummary.slice(0, MAX_LICENSE_ITEMS);
      truncations.push(`licenseUtilizationSummary capped at ${MAX_LICENSE_ITEMS} items`);
    }
    if (this.estimateTokens(ctx) <= budgetTokens) {
      return this.finalize(ctx, budgetTokens, truncations);
    }

    // Step 3 — cap quickWins.
    if (ctx.quickWins.length > MAX_QUICK_WINS) {
      ctx.quickWins = ctx.quickWins.slice(0, MAX_QUICK_WINS);
      truncations.push(`quickWins capped at ${MAX_QUICK_WINS} items`);
    }
    if (this.estimateTokens(ctx) <= budgetTokens) {
      return this.finalize(ctx, budgetTokens, truncations);
    }

    // Step 4 — cap governor limits near threshold.
    if (ctx.governorLimitsSummary.limitsNearThreshold.length > MAX_GOV_LIMITS) {
      ctx.governorLimitsSummary.limitsNearThreshold = ctx.governorLimitsSummary.limitsNearThreshold.slice(0, MAX_GOV_LIMITS);
      truncations.push(`governorLimitsSummary.limitsNearThreshold capped at ${MAX_GOV_LIMITS} items`);
    }
    if (this.estimateTokens(ctx) <= budgetTokens) {
      return this.finalize(ctx, budgetTokens, truncations);
    }

    // Step 5 — drop optimizerReport to save tokens.
    truncations.push('optimizerReport omitted to save tokens');
    (ctx as Partial<AssessmentContext>).optimizerReport = undefined as unknown as PayloadOptimizerReport;
    return this.finalize(ctx, budgetTokens, truncations);
  }

  private finalize(ctx: AssessmentContext, budget: number, truncations: string[]): AssessmentContext {
    ctx.optimizerReport = {
      estimatedTokens: this.estimateTokens(ctx),
      budget,
      truncationsApplied: truncations,
    };
    return ctx;
  }
}
