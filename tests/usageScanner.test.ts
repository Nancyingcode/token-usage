import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanCodexUsage } from '../src/main/usageScanner';

const TEST_DIRECTORY_PREFIX = 'codex-token-usage-';

describe('usageScanner', () => {
  let testDirectory = '';

  beforeEach(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), TEST_DIRECTORY_PREFIX));
  });

  afterEach(async () => {
    await rm(testDirectory, { recursive: true, force: true });
  });

  it('keeps stable session order and isolates invalid session data', async () => {
    const timestamp = '2026-07-16T00:00:00.000Z';
    await writeFile(join(testDirectory, 'b.jsonl'), validSession('b', timestamp));
    await writeFile(join(testDirectory, 'a.jsonl'), validSession('a', timestamp));
    await writeFile(join(testDirectory, 'broken.jsonl'), 'null');

    const result = await scanCodexUsage({ sessionsDir: testDirectory });

    expect(result.summary.sessions.map(({ sessionId }) => sessionId)).toEqual(['a', 'b', 'broken']);
    expect(result.warnings.some(({ sourceFile }) => sourceFile?.endsWith('broken.jsonl'))).toBe(
      true
    );
  });

  it('returns a directory warning when the sessions path is missing', async () => {
    const missingDirectory = join(testDirectory, 'missing');
    const result = await scanCodexUsage({ sessionsDir: missingDirectory });

    expect(result.summary.sessions).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].sourceFile).toBe(missingDirectory);
  });
});

const validSession = (sessionId: string, timestamp: string): string =>
  [
    JSON.stringify({
      timestamp,
      type: 'session_meta',
      payload: { session_id: sessionId, cwd: `C:\\repo\\${sessionId}` },
    }),
    JSON.stringify({
      timestamp,
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: {
            input_tokens: 10,
            cached_input_tokens: 0,
            output_tokens: 2,
            reasoning_output_tokens: 0,
            total_tokens: 12,
          },
        },
      },
    }),
  ].join('\n');
