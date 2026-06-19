import { v1 } from '@authzed/authzed-node';

/**
 * Consistency options for SpiceDB requests.
 * SpiceDB supports multiple consistency levels for read operations.
 */
export type ConsistencyOption =
  | { type: 'fully_consistent' }
  | { type: 'at_least_as_fresh'; token: string }
  | { type: 'at_exact_snapshot'; token: string }
  | { type: 'minimize_latency' };

export function fullyConsistent(): ConsistencyOption {
  return { type: 'fully_consistent' };
}

export function atLeastAsFresh(token: string): ConsistencyOption {
  return { type: 'at_least_as_fresh', token };
}

export function atExactSnapshot(token: string): ConsistencyOption {
  return { type: 'at_exact_snapshot', token };
}

export function minimizeLatency(): ConsistencyOption {
  return { type: 'minimize_latency' };
}

/**
 * Build a protobuf Consistency object from a ConsistencyOption.
 * Defaults to fully_consistent when no option is provided.
 */
export function buildConsistency(option?: ConsistencyOption): v1.Consistency {
  if (!option) {
    return v1.Consistency.create({
      requirement: { oneofKind: 'fullyConsistent', fullyConsistent: true },
    });
  }

  switch (option.type) {
    case 'fully_consistent':
      return v1.Consistency.create({
        requirement: { oneofKind: 'fullyConsistent', fullyConsistent: true },
      });
    case 'at_least_as_fresh':
      return v1.Consistency.create({
        requirement: {
          oneofKind: 'atLeastAsFresh',
          atLeastAsFresh: v1.ZedToken.create({ token: option.token }),
        },
      });
    case 'at_exact_snapshot':
      return v1.Consistency.create({
        requirement: {
          oneofKind: 'atExactSnapshot',
          atExactSnapshot: v1.ZedToken.create({ token: option.token }),
        },
      });
    case 'minimize_latency':
      return v1.Consistency.create({
        requirement: { oneofKind: 'minimizeLatency', minimizeLatency: true },
      });
  }
}
