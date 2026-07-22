import { describe, expect, it } from 'vitest';
import { isAllowedExternalUrl } from '../src/main/externalUrlPolicy';

describe('external URL policy', () => {
  it('allows only HTTPS OpenAI developer documentation links', () => {
    expect(isAllowedExternalUrl('https://developers.openai.com/api/docs/models/gpt-5.5')).toBe(
      true
    );
    expect(isAllowedExternalUrl('http://developers.openai.com/api/docs')).toBe(false);
    expect(isAllowedExternalUrl('https://developers.openai.com.evil.example/api/docs')).toBe(false);
    expect(isAllowedExternalUrl('https://example.com')).toBe(false);
    expect(isAllowedExternalUrl('not a URL')).toBe(false);
  });
});
