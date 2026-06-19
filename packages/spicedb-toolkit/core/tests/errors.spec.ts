import { describe, it, expect } from 'vitest';
import {
  SpiceDbToolkitError,
  wrapGrpcError,
  isPermissionDenied,
  isNotFound,
  isSchemaError,
  isUnavailable,
} from '../src/common/errors.js';

describe('SpiceDbToolkitError', () => {
  it('should create error with message and code', () => {
    const err = new SpiceDbToolkitError('test error', 'PERMISSION_DENIED');
    expect(err.message).toBe('test error');
    expect(err.code).toBe('PERMISSION_DENIED');
    expect(err.name).toBe('SpiceDbToolkitError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SpiceDbToolkitError);
  });

  it('should support cause/original error', () => {
    const original = new Error('grpc failed');
    const err = new SpiceDbToolkitError('wrapped', 'UNAVAILABLE', original);
    expect(err.cause).toBe(original);
  });
});

describe('wrapGrpcError', () => {
  it('should return existing SpiceDbToolkitError unchanged', () => {
    const existing = new SpiceDbToolkitError('already wrapped', 'NOT_FOUND');
    const result = wrapGrpcError(existing);
    expect(result).toBe(existing);
  });

  it('should wrap a plain error', () => {
    const plain = new Error('connection failed');
    const result = wrapGrpcError(plain);
    expect(result).toBeInstanceOf(SpiceDbToolkitError);
    expect(result.code).toBe('UNKNOWN');
    expect(result.cause).toBe(plain);
  });

  it('should detect gRPC status code in error', () => {
    const grpcError = Object.assign(new Error('PERMISSION_DENIED'), { code: 7 });
    const result = wrapGrpcError(grpcError);
    expect(result).toBeInstanceOf(SpiceDbToolkitError);
    expect(result.code).toBe('PERMISSION_DENIED');
  });
});

describe('error type guards', () => {
  it('isPermissionDenied', () => {
    const err = new SpiceDbToolkitError('denied', 'PERMISSION_DENIED');
    expect(isPermissionDenied(err)).toBe(true);
    expect(isPermissionDenied(new SpiceDbToolkitError('x', 'NOT_FOUND'))).toBe(false);
  });

  it('isNotFound', () => {
    const err = new SpiceDbToolkitError('gone', 'NOT_FOUND');
    expect(isNotFound(err)).toBe(true);
  });

  it('isSchemaError', () => {
    const err = new SpiceDbToolkitError('bad schema', 'INVALID_ARGUMENT');
    expect(isSchemaError(err)).toBe(true);
  });

  it('isUnavailable', () => {
    const err = new SpiceDbToolkitError('down', 'UNAVAILABLE');
    expect(isUnavailable(err)).toBe(true);
  });
});
