import { describe, expect, it } from 'vitest';

import { isUrlAllowed } from '../util';

describe('isUrlAllowed firewall priority', () => {
  it('allows an allow-list URL even when it is also on the deny list', () => {
    expect(isUrlAllowed('https://example.com', ['example.com'], ['example.com'])).toBe(true);
  });

  it('allows an allow-list subdomain even when the deny list has a matching subdomain', () => {
    expect(isUrlAllowed('https://sub.example.com', ['example.com'], ['sub.example.com'])).toBe(true);
  });

  it('blocks URLs outside a non-empty allow list', () => {
    expect(isUrlAllowed('https://google.com', ['example.com'], [])).toBe(false);
  });

  it('blocks unrelated hosts when the allow list contains only a host and port', () => {
    expect(isUrlAllowed('https://blocked.example.com', ['allowed.example.com:31800'], [])).toBe(false);
  });

  it('allows a matching host and port allow-list entry with a trailing slash', () => {
    expect(isUrlAllowed('http://allowed.example.com:31800/', ['allowed.example.com:31800'], [])).toBe(true);
  });

  it('uses the deny list when the allow list is empty', () => {
    expect(isUrlAllowed('https://example.com', [], ['example.com'])).toBe(false);
  });

  it('allows normal HTTPS URLs when both lists are empty', () => {
    expect(isUrlAllowed('https://example.com', [], [])).toBe(true);
  });

  it('always blocks dangerous URLs even when they are allow-listed', () => {
    expect(isUrlAllowed('chrome://extensions', ['chrome://extensions'], [])).toBe(false);
    expect(isUrlAllowed('file:///C:/tmp/test.txt', ['file:///C:/tmp/test.txt'], [])).toBe(false);
    expect(isUrlAllowed('javascript:alert(1)', ['javascript:alert(1)'], [])).toBe(false);
  });

  it('allows about:blank explicitly', () => {
    expect(isUrlAllowed('about:blank', ['example.com'], ['about:blank'])).toBe(true);
  });
});
