import { describe, it, expect } from 'vitest';
import {
  fullyConsistent,
  atLeastAsFresh,
  atExactSnapshot,
  minimizeLatency,
} from '../src/common/consistency.js';

describe('consistency helpers', () => {
  it('fullyConsistent returns correct type', () => {
    const c = fullyConsistent();
    expect(c).toStrictEqual({ type: 'fully_consistent' });
  });

  it('atLeastAsFresh returns token-based consistency', () => {
    const c = atLeastAsFresh('zed_token_123');
    expect(c).toStrictEqual({ type: 'at_least_as_fresh', token: 'zed_token_123' });
  });

  it('atExactSnapshot returns token-based consistency', () => {
    const c = atExactSnapshot('snapshot_abc');
    expect(c).toStrictEqual({ type: 'at_exact_snapshot', token: 'snapshot_abc' });
  });

  it('minimizeLatency returns correct type', () => {
    const c = minimizeLatency();
    expect(c).toStrictEqual({ type: 'minimize_latency' });
  });
});
