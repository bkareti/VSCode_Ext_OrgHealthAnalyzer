/**
 * Custom error types for the Salesforce Org Health Analyzer
 */

export class SalesforceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SalesforceError';
    Object.setPrototypeOf(this, SalesforceError.prototype);
  }
}

export class SalesforceAuthError extends SalesforceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AUTH_ERROR', details);
    this.name = 'SalesforceAuthError';
  }
}

export class SalesforceConnectionError extends SalesforceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'SalesforceConnectionError';
  }
}

export class SalesforceQueryError extends SalesforceError {
  constructor(
    message: string,
    public readonly query?: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'QUERY_ERROR', { ...details, query });
    this.name = 'SalesforceQueryError';
  }
}

export class RateLimitError extends SalesforceError {
  constructor(
    public readonly retryAfter: number,
    details?: Record<string, unknown>
  ) {
    super(`Rate limit exceeded. Retry after ${retryAfter}ms`, 'RATE_LIMIT', details);
    this.name = 'RateLimitError';
  }
}

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly file: string,
    public readonly line?: number,
    public readonly column?: number
  ) {
    super(message);
    this.name = 'ParseError';
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly configKey?: string
  ) {
    super(message);
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly analyzerName: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AnalysisError';
    Object.setPrototypeOf(this, AnalysisError.prototype);
  }
}

/**
 * Check if an error is a Salesforce authentication error
 */
export function isAuthError(error: unknown): error is SalesforceAuthError {
  return error instanceof SalesforceAuthError;
}

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

/**
 * Wrap an async function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delay?: number; backoff?: number } = {}
): Promise<T> {
  const { maxRetries = 3, delay = 1000, backoff = 2 } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry auth errors
      if (isAuthError(error)) {
        throw error;
      }

      // Handle rate limits specifically
      if (isRateLimitError(error)) {
        await sleep(error.retryAfter);
        continue;
      }

      // Exponential backoff
      if (attempt < maxRetries - 1) {
        await sleep(delay * Math.pow(backoff, attempt));
      }
    }
  }

  throw lastError;
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
