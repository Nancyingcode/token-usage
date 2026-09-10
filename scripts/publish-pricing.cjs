/**
 * @file 独立价格目录发布
 * @description 仅由显式启用的 GitHub Actions 发布 pricing 分支；非强制更新避免覆盖并发发布。
 */
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');

const REPOSITORY = 'Nancyingcode/token-usage';
const BRANCH = 'pricing';

const publishCatalog = async (catalog, conditionalCatalog, request) => {
  const reference = await request(`/git/ref/heads/${BRANCH}`, undefined, true);
  const parent = reference?.object.sha;
  const tree = await request('/git/trees', {
    // 两个客户端协议必须来自同一快照，只有最终 ref 更新才对客户端可见。
    tree: [catalog, conditionalCatalog].map((entry, index) => ({
      path: index === 0 ? 'catalog.json' : 'catalog-v2.json',
      mode: '100644',
      type: 'blob',
      content: `${JSON.stringify(entry, null, 2)}\n`,
    })),
  });
  const commit = await request('/git/commits', {
    message: `chore(pricing): update catalog ${catalog.version}`,
    tree: tree.sha,
    parents: parent ? [parent] : [],
  });
  if (parent) {
    await request(`/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false }, false, 'PATCH');
  } else {
    await request('/git/refs', { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
  }
};

const main = async () => {
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REPOSITORY !== REPOSITORY ||
    !process.env.GITHUB_TOKEN
  ) {
    throw new Error('Publishing requires the configured repository GitHub Actions environment.');
  }
  const { decodePricingCatalog } = await require('./load-pricing-validator.cjs')();
  const catalog = decodePricingCatalog(
    JSON.parse(await readFile(resolve('pricing/catalog.json'), 'utf8'))
  );
  const conditionalCatalog = decodePricingCatalog(
    JSON.parse(await readFile(resolve('pricing/catalog-v2.json'), 'utf8'))
  );
  if (
    catalog.schemaVersion !== 1 ||
    conditionalCatalog.schemaVersion !== 2 ||
    JSON.stringify(catalog) !==
      JSON.stringify(decodePricingCatalog({ ...conditionalCatalog, schemaVersion: 1 }))
  ) {
    throw new Error('Pricing catalogs must share the same base-price snapshot.');
  }
  const request = async (path, body, allowMissing = false, method = body ? 'POST' : 'GET') => {
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (allowMissing && response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Pricing publication failed: HTTP ${response.status}`);
    }
    return response.json();
  };
  await publishCatalog(catalog, conditionalCatalog, request);
};

module.exports = { publishCatalog };
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
