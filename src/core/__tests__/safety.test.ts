import { describe, expect, test } from 'vitest';

import {
  MAX_PORT,
  MIN_PORT,
  MAX_PATH_LENGTH,
  MAX_GENERIC_STRING_LENGTH,
  MAX_LABEL_LENGTH,
  getString,
  getStringWithMaxLength,
  getNumber,
  getSafeInteger,
  getPositiveNumber,
  getBoolean,
  getArray,
  getObject,
  isValidPort,
  isValidPathLength,
  isValidStringLength,
  isRecord,
  isNotNull,
  getPort,
  getSeqnum,
} from '../safety.js';

describe('Constants', () => {
  test('MAX_PORT is 65535', () => expect(MAX_PORT).toBe(65_535));
  test('MIN_PORT is 1', () => expect(MIN_PORT).toBe(1));
  test('MAX_PATH_LENGTH is 4096', () => expect(MAX_PATH_LENGTH).toBe(4_096));
  test('MAX_GENERIC_STRING_LENGTH is 10000', () => expect(MAX_GENERIC_STRING_LENGTH).toBe(10_000));
  test('MAX_LABEL_LENGTH is 255', () => expect(MAX_LABEL_LENGTH).toBe(255));
});

describe('getString()', () => {
  test('extracts a valid string', () => expect(getString({ key: 'hello' }, 'key')).toBe('hello'));
  test('trims whitespace', () => expect(getString({ key: '  hello  ' }, 'key')).toBe('hello'));
  test('returns undefined for empty strings', () => expect(getString({ key: '' }, 'key')).toBeUndefined());
  test('returns undefined for whitespace-only', () => expect(getString({ key: '   ' }, 'key')).toBeUndefined());
  test('returns undefined for non-string', () => expect(getString({ key: 42 }, 'key')).toBeUndefined());
  test('returns undefined for missing keys', () => expect(getString({}, 'missing')).toBeUndefined());
  test('returns undefined for null', () => expect(getString({ key: null }, 'key')).toBeUndefined());
});

describe('getStringWithMaxLength()', () => {
  test('returns string as-is when within limit', () => expect(getStringWithMaxLength({ key: 'hello' }, 'key', 10)).toBe('hello'));
  test('returns undefined for missing key', () => expect(getStringWithMaxLength({}, 'missing', 10)).toBeUndefined());
  test('truncates string exceeding max length', () => expect(getStringWithMaxLength({ key: 'hello world' }, 'key', 5)).toBe('hello'));
});

describe('getNumber()', () => {
  test('extracts a valid finite number', () => expect(getNumber({ key: 42 }, 'key')).toBe(42));
  test('extracts floating point', () => expect(getNumber({ key: 3.14 }, 'key')).toBeCloseTo(3.14));
  test('returns undefined for NaN', () => expect(getNumber({ key: NaN }, 'key')).toBeUndefined());
  test('returns undefined for Infinity', () => expect(getNumber({ key: Infinity }, 'key')).toBeUndefined());
  test('returns undefined for strings', () => expect(getNumber({ key: '42' }, 'key')).toBeUndefined());
  test('returns undefined for missing keys', () => expect(getNumber({}, 'missing')).toBeUndefined());
});

describe('getSafeInteger()', () => {
  test('extracts a valid integer', () => expect(getSafeInteger({ key: 42 }, 'key')).toBe(42));
  test('returns undefined for floating point', () => expect(getSafeInteger({ key: 42.5 }, 'key')).toBeUndefined());
  test('respects min constraint', () => {
    expect(getSafeInteger({ key: 5 }, 'key', { min: 10 })).toBeUndefined();
    expect(getSafeInteger({ key: 5 }, 'key', { min: 5 })).toBe(5);
  });
  test('respects max constraint', () => {
    expect(getSafeInteger({ key: 5 }, 'key', { max: 3 })).toBeUndefined();
    expect(getSafeInteger({ key: 5 }, 'key', { max: 5 })).toBe(5);
  });
});

describe('getPositiveNumber()', () => {
  test('extracts positive numbers', () => expect(getPositiveNumber({ key: 42 }, 'key')).toBe(42));
  test('returns undefined for zero', () => expect(getPositiveNumber({ key: 0 }, 'key')).toBeUndefined());
  test('returns undefined for negative', () => expect(getPositiveNumber({ key: -5 }, 'key')).toBeUndefined());
});

describe('getBoolean()', () => {
  test('extracts true boolean', () => expect(getBoolean({ key: true }, 'key')).toBe(true));
  test('extracts false boolean', () => expect(getBoolean({ key: false }, 'key')).toBe(false));
  test('handles string "true"', () => expect(getBoolean({ key: 'true' }, 'key')).toBe(true));
  test('handles string "false"', () => expect(getBoolean({ key: 'false' }, 'key')).toBe(false));
  test('handles string "1"', () => expect(getBoolean({ key: '1' }, 'key')).toBe(true));
  test('handles string "0"', () => expect(getBoolean({ key: '0' }, 'key')).toBe(false));
  test('returns undefined for other strings', () => expect(getBoolean({ key: 'yes' }, 'key')).toBeUndefined());
});

describe('getArray()', () => {
  test('extracts a valid array', () => expect(getArray({ key: [1, 2, 3] }, 'key')).toEqual([1, 2, 3]));
  test('extracts empty arrays', () => expect(getArray({ key: [] }, 'key')).toEqual([]));
  test('returns undefined for objects', () => expect(getArray({ key: { a: 1 } }, 'key')).toBeUndefined());
  test('returns undefined for primitives', () => expect(getArray({ key: 'string' }, 'key')).toBeUndefined());
});

describe('getObject()', () => {
  test('extracts a valid plain object', () => expect(getObject({ key: { nested: true } }, 'key')).toEqual({ nested: true }));
  test('returns undefined for arrays', () => expect(getObject({ key: [1, 2, 3] }, 'key')).toBeUndefined());
  test('returns undefined for null', () => expect(getObject({ key: null }, 'key')).toBeUndefined());
  test('returns undefined for primitives', () => expect(getObject({ key: 'string' }, 'key')).toBeUndefined());
});

describe('isValidPort()', () => {
  test('returns true for valid ports', () => {
    expect(isValidPort(80)).toBe(true);
    expect(isValidPort(443)).toBe(true);
    expect(isValidPort(8080)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
    expect(isValidPort(1)).toBe(true);
  });
  test('returns false for ports below 1', () => {
    expect(isValidPort(0)).toBe(false);
    expect(isValidPort(-1)).toBe(false);
  });
  test('returns false for ports above 65535', () => {
    expect(isValidPort(65536)).toBe(false);
  });
  test('returns false for non-integers', () => expect(isValidPort(80.5)).toBe(false));
  test('returns false for undefined', () => expect(isValidPort(undefined)).toBe(false));
});

describe('isValidPathLength()', () => {
  test('returns true for short paths', () => expect(isValidPathLength('/home/user/project')).toBe(true));
  test('returns true for path at exact limit', () => expect(isValidPathLength('a'.repeat(4096))).toBe(true));
  test('returns false for paths exceeding limit', () => expect(isValidPathLength('a'.repeat(4097))).toBe(false));
  test('returns false for undefined', () => expect(isValidPathLength(undefined)).toBe(false));
  test('returns false for empty string', () => expect(isValidPathLength('')).toBe(false));
});

describe('isValidStringLength()', () => {
  test('returns true for strings within limit', () => expect(isValidStringLength('hello', 10)).toBe(true));
  test('returns true for strings at exact limit', () => expect(isValidStringLength('hello', 5)).toBe(true));
  test('returns false for strings exceeding limit', () => expect(isValidStringLength('hello world', 5)).toBe(false));
  test('returns false for undefined', () => expect(isValidStringLength(undefined, 10)).toBe(false));
});

describe('isRecord()', () => {
  test('returns true for plain objects', () => expect(isRecord({})).toBe(true));
  test('returns false for null', () => expect(isRecord(null)).toBe(false));
  test('returns false for arrays', () => expect(isRecord([1, 2, 3])).toBe(false));
  test('returns false for primitives', () => {
    expect(isRecord('string')).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
  test('returns false for class instances', () => {
    expect(isRecord(new Date())).toBe(false);
    expect(isRecord(new Map())).toBe(false);
  });
});

describe('isNotNull()', () => {
  test('returns true for any non-null value', () => {
    expect(isNotNull('string')).toBe(true);
    expect(isNotNull(0)).toBe(true);
    expect(isNotNull(false)).toBe(true);
  });
  test('returns false for null', () => expect(isNotNull(null)).toBe(false));
  test('returns false for undefined', () => expect(isNotNull(undefined)).toBe(false));
});

describe('getPort()', () => {
  test('extracts valid port numbers', () => expect(getPort({ port: 4820 }, 'port')).toBe(4820));
  test('returns undefined for out-of-range ports', () => {
    expect(getPort({ port: 0 }, 'port')).toBeUndefined();
    expect(getPort({ port: 65536 }, 'port')).toBeUndefined();
    expect(getPort({ port: -1 }, 'port')).toBeUndefined();
  });
  test('returns undefined for non-integers', () => expect(getPort({ port: 4820.5 }, 'port')).toBeUndefined());
});

describe('getSeqnum()', () => {
  test('extracts valid sequence numbers', () => {
    expect(getSeqnum({ seqnum: 1 }, 'seqnum')).toBe(1);
    expect(getSeqnum({ seqnum: 42 }, 'seqnum')).toBe(42);
  });
  test('returns undefined for zero', () => expect(getSeqnum({ seqnum: 0 }, 'seqnum')).toBeUndefined());
  test('returns undefined for negative numbers', () => expect(getSeqnum({ seqnum: -1 }, 'seqnum')).toBeUndefined());
});
