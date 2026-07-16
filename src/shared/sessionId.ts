const ROLLOUT_SESSION_FILE_PATTERN = /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)\.jsonl$/;
const JSONL_EXTENSION_PATTERN = /\.jsonl$/;

export default function getSessionId(sourcePath: string): string {
  const normalizedPath = sourcePath.replace(/\\/g, '/');
  const sourceName = normalizedPath.split('/').pop() ?? sourcePath;
  const match = sourceName.match(ROLLOUT_SESSION_FILE_PATTERN);

  return match?.[1] ?? sourceName.replace(JSONL_EXTENSION_PATTERN, '');
}
