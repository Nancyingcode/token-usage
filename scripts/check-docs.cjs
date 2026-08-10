/**
 * @file Documentation policy checker
 * @description Validates Markdown UTF-8 encoding, fenced blocks, and local links without external dependencies.
 */

const { access, readdir, readFile, stat } = require('node:fs/promises');
const { dirname, extname, isAbsolute, resolve } = require('node:path');

// Documentation roots checked when no explicit paths are supplied by lint-staged.
const DEFAULT_DOCUMENTATION_PATHS = ['AGENTS.md', 'README.md', 'docs', 'rules'];
const MARKDOWN_EXTENSION = '.md';
const LOCAL_LINK_PATTERN =
  /!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/g;
const REFERENCE_TARGET_PATTERN = /^\s*\[[^\]]+]:\s*(<[^>]+>|\S+)/gm;
const FENCE_PATTERN = /^\s*(`{3,}|~{3,})/;
const EXTERNAL_TARGET_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const WORKSPACE_ROOT = resolve(__dirname, '..');

const pathExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const collectMarkdownFiles = async (inputPath) => {
  const absolutePath = isAbsolute(inputPath) ? inputPath : resolve(WORKSPACE_ROOT, inputPath);

  if (!(await pathExists(absolutePath))) {
    return [];
  }

  const entry = await stat(absolutePath);
  if (entry.isFile()) {
    return extname(absolutePath).toLowerCase() === MARKDOWN_EXTENSION ? [absolutePath] : [];
  }

  const children = await readdir(absolutePath, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    children.map((child) => collectMarkdownFiles(resolve(absolutePath, child.name)))
  );

  return nestedFiles.flat();
};

const decodeMarkdown = async (filePath) => {
  try {
    return UTF8_DECODER.decode(await readFile(filePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${filePath}: invalid UTF-8 (${message})`, { cause: error });
  }
};

const findFenceIssues = (filePath, source) => {
  let openFence;

  source.split(/\r?\n/).forEach((line, index) => {
    const marker = line.match(FENCE_PATTERN)?.[1];
    if (!marker) {
      return;
    }

    if (!openFence) {
      openFence = { character: marker[0], length: marker.length, line: index + 1 };
      return;
    }

    if (marker[0] === openFence.character && marker.length >= openFence.length) {
      openFence = undefined;
    }
  });

  return openFence ? [`${filePath}:${openFence.line}: unclosed fenced code block`] : [];
};

const normalizeLocalTarget = (rawTarget) => {
  const target =
    rawTarget.startsWith('<') && rawTarget.endsWith('>') ? rawTarget.slice(1, -1) : rawTarget;
  const pathWithoutFragment = target.split('#', 1)[0].split('?', 1)[0];

  try {
    return decodeURIComponent(pathWithoutFragment);
  } catch {
    return pathWithoutFragment;
  }
};

// Preserve offsets and newlines while excluding code samples from Markdown link parsing.
const maskCodeForLinkChecking = (source) => {
  let openFence;

  return source
    .split(/(\r\n|\n|\r)/)
    .map((segment) => {
      if (/^(?:\r\n|\n|\r)$/.test(segment)) {
        return segment;
      }

      const marker = segment.match(FENCE_PATTERN)?.[1];
      if (marker) {
        if (!openFence) {
          openFence = { character: marker[0], length: marker.length };
        } else if (marker[0] === openFence.character && marker.length >= openFence.length) {
          openFence = undefined;
        }

        return ' '.repeat(segment.length);
      }

      if (openFence) {
        return ' '.repeat(segment.length);
      }

      return segment.replace(/`+[^`]*`+/g, (inlineCode) => ' '.repeat(inlineCode.length));
    })
    .join('');
};

const findLocalLinkIssues = async (filePath, source) => {
  const issues = [];
  const linkSource = maskCodeForLinkChecking(source);
  const targetMatches = [
    ...linkSource.matchAll(LOCAL_LINK_PATTERN),
    ...linkSource.matchAll(REFERENCE_TARGET_PATTERN),
  ];

  for (const match of targetMatches) {
    const rawTarget = match[1];
    if (EXTERNAL_TARGET_PATTERN.test(rawTarget)) {
      continue;
    }

    const localTarget = normalizeLocalTarget(rawTarget);
    if (!localTarget) {
      continue;
    }

    const absoluteTarget = resolve(dirname(filePath), localTarget);
    if (!(await pathExists(absoluteTarget))) {
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      issues.push(`${filePath}:${line}: missing local link target ${rawTarget}`);
    }
  }

  return issues;
};

const checkMarkdownFile = async (filePath) => {
  const source = await decodeMarkdown(filePath);
  return [...findFenceIssues(filePath, source), ...(await findLocalLinkIssues(filePath, source))];
};

const main = async () => {
  const requestedPaths = process.argv.slice(2);
  const inputPaths = requestedPaths.length > 0 ? requestedPaths : DEFAULT_DOCUMENTATION_PATHS;
  const nestedFiles = await Promise.all(inputPaths.map(collectMarkdownFiles));
  const markdownFiles = [...new Set(nestedFiles.flat())].sort();
  const results = await Promise.all(markdownFiles.map(checkMarkdownFile));
  const issues = results.flat();

  if (issues.length > 0) {
    issues.forEach((issue) => process.stderr.write(`${issue}\n`));
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Documentation checks passed (${markdownFiles.length} files).\n`);
};

main().catch((error) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
