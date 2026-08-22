// src/modules/yapiez/services/assertions.ts
//
// Turns the validations QA authored into Pass/Fail for one executed step.
// A step passes only when every one of its assertions passes; a step with no
// assertions falls back to "2xx/3xx is a pass" so a flow is useful before
// anyone has written a single check.

import { Assertion, AssertionResult } from '../types';
import { readPath, render, VariableContext } from './template';

export interface ExecutedResponse {
  statusCode: number;
  headers: Record<string, string>;
  /** Parsed JSON when the response was JSON, otherwise the raw string. */
  body: unknown;
  rawBody: string;
  /**
   * Size of the payload in BYTES.
   *
   * Not `rawBody.length` — that counts UTF-16 code units, so an accented
   * character under-reports by one and an emoji by two. Any response with
   * non-ASCII content would show a size smaller than it really is.
   */
  byteSize: number;
  durationMs: number;
}

/** Human-readable rendering of whatever an assertion actually found. */
function describe(value: unknown): string {
  if (value === undefined) return '(missing)';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** The value an assertion is looking at, before the operator is applied. */
function actualFor(assertion: Assertion, response: ExecutedResponse): unknown {
  switch (assertion.source) {
    case 'status':
      return response.statusCode;
    case 'responseTime':
      return response.durationMs;
    case 'header': {
      // Header names are case-insensitive; the transport lowercases them.
      const name = (assertion.path ?? '').toLowerCase();
      return response.headers[name];
    }
    case 'body':
    default:
      return readPath(response.body, assertion.path);
  }
}

/** Loose equality that treats 201 and "201" as the same answer. */
function looseEquals(actual: unknown, expected: string): boolean {
  if (actual === null || actual === undefined) return expected === '' || expected === 'null';
  if (typeof actual === 'object') {
    try {
      return JSON.stringify(actual) === JSON.stringify(JSON.parse(expected));
    } catch {
      return JSON.stringify(actual) === expected;
    }
  }
  if (typeof actual === 'boolean') return String(actual) === expected.toLowerCase();
  return String(actual) === expected;
}

function isEmptyValue(actual: unknown): boolean {
  if (actual === null || actual === undefined) return true;
  if (typeof actual === 'string') return actual.length === 0;
  if (Array.isArray(actual)) return actual.length === 0;
  if (typeof actual === 'object') return Object.keys(actual as object).length === 0;
  return false;
}

function applyOperator(assertion: Assertion, actual: unknown, expected: string): boolean {
  switch (assertion.operator) {
    case 'equals':
      return looseEquals(actual, expected);
    case 'notEquals':
      return !looseEquals(actual, expected);
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'notExists':
      return actual === undefined || actual === null;
    case 'contains':
      return describe(actual).includes(expected);
    case 'notContains':
      return !describe(actual).includes(expected);
    case 'matches':
      try {
        return new RegExp(expected).test(describe(actual));
      } catch {
        // An unparseable regex is the author's bug, not the API's — fail it so
        // the message surfaces rather than silently passing.
        return false;
      }
    case 'greaterThan':
      return Number(actual) > Number(expected);
    case 'lessThan':
      return Number(actual) < Number(expected);
    case 'isNumber':
      return typeof actual === 'number' && !Number.isNaN(actual);
    case 'isString':
      return typeof actual === 'string';
    case 'isBoolean':
      return typeof actual === 'boolean';
    case 'isArray':
      return Array.isArray(actual);
    case 'isEmpty':
      return isEmptyValue(actual);
    case 'isNotEmpty':
      return !isEmptyValue(actual);
    default:
      return false;
  }
}

function label(assertion: Assertion): string {
  if (assertion.name) return assertion.name;
  const target =
    assertion.source === 'status'
      ? 'status'
      : assertion.source === 'responseTime'
        ? 'response time'
        : `${assertion.source}.${assertion.path ?? ''}`.replace(/\.$/, '');
  return `${target} ${assertion.operator}${assertion.expected ? ` ${assertion.expected}` : ''}`;
}

export function evaluateAssertion(
  assertion: Assertion,
  response: ExecutedResponse,
  context: VariableContext
): AssertionResult {
  // Expected values are rendered too, so "user.email equals {{email}}" compares
  // the response against the very value the request was built from.
  const expected = render(assertion.expected ?? '', context);
  const actual = actualFor(assertion, response);
  const passed = applyOperator(assertion, actual, expected);

  return {
    name: label(assertion),
    source: assertion.source,
    path: assertion.path,
    operator: assertion.operator,
    expected,
    actual: describe(actual),
    passed,
    message: passed
      ? 'Passed'
      : `Expected ${assertion.operator}${expected ? ` "${expected}"` : ''}, got "${describe(actual)}"`,
  };
}

export interface AssertionOutcome {
  passed: boolean;
  results: AssertionResult[];
}

/**
 * Run every assertion for a step.
 *
 * With no assertions authored, the transport-level answer stands in: any 2xx or
 * 3xx is a pass. That keeps "just run my flow and tell me what broke" working
 * on day one.
 */
export function evaluateAssertions(
  assertions: Assertion[],
  response: ExecutedResponse,
  context: VariableContext
): AssertionOutcome {
  if (!assertions.length) {
    const passed = response.statusCode >= 200 && response.statusCode < 400;
    return {
      passed,
      results: [
        {
          name: 'Response status is successful',
          source: 'status',
          operator: 'lessThan',
          expected: '400',
          actual: String(response.statusCode),
          passed,
          message: passed
            ? `Passed (${response.statusCode})`
            : `Expected a 2xx/3xx status, got ${response.statusCode}`,
        },
      ],
    };
  }

  const results = assertions.map((a) => evaluateAssertion(a, response, context));
  return { passed: results.every((r) => r.passed), results };
}
