const { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (!existsSync('.git')) {
  process.exit(0);
}

const hookNames = [
  'pre-commit',
  'pre-merge-commit',
  'prepare-commit-msg',
  'commit-msg',
  'post-commit',
  'applypatch-msg',
  'pre-applypatch',
  'post-applypatch',
  'pre-rebase',
  'post-rewrite',
  'post-checkout',
  'post-merge',
  'pre-push',
  'pre-auto-gc',
];

const candidates = [
  process.env.GIT_BINARY,
  'C:\\Program Files\\Git\\cmd\\git.exe',
  'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
  'git',
].filter(Boolean);

function canRunGit(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return result.status === 0;
}

const git = candidates.find(canRunGit);

const huskyDir = path.join('.husky', '_');
mkdirSync(huskyDir, { recursive: true });
writeFileSync(path.join(huskyDir, '.gitignore'), '*\n');

const huskyRuntime = path.join('node_modules', 'husky', 'husky');
const huskyRunner = path.join(huskyDir, 'h');

if (existsSync(huskyRuntime)) {
  copyFileSync(huskyRuntime, huskyRunner);
} else {
  writeFileSync(
    huskyRunner,
    [
      '#!/usr/bin/env sh',
      'n=$(basename "$0")',
      's=$(dirname "$(dirname "$0")")/$n',
      '[ ! -f "$s" ] && exit 0',
      'export PATH="node_modules/.bin:$PATH"',
      'sh -e "$s" "$@"',
    ].join('\n')
  );
}

rmSync(path.join(huskyDir, 'husky.sh'), { force: true });
writeFileSync(
  path.join(huskyDir, 'husky.sh'),
  [
    'echo "husky - DEPRECATED',
    '',
    'Please remove the following two lines from $0:',
    '',
    '#!/usr/bin/env sh',
    '. \\"\\$(dirname -- \\"\\$0\\")/_/husky.sh\\"',
    '',
    'They WILL FAIL in v10.0.0"',
  ].join('\n')
);

hookNames.forEach((hookName) => {
  writeFileSync(path.join(huskyDir, hookName), `#!/usr/bin/env sh\n. "$(dirname "$0")/h"\n`);
});

if (git) {
  const result = spawnSync(git, ['config', 'core.hooksPath', '.husky/_'], {
    stdio: 'ignore',
  });

  if (result.status !== 0) {
    process.stdout.write('husky: proxy hooks created; git config was skipped\n');
  }
} else {
  process.stdout.write('husky: proxy hooks created; git command not found\n');
}
