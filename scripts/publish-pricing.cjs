/**
 * @file 独立价格目录发布
 * @description 仅由显式启用的 GitHub Actions 发布 pricing 分支；非强制更新避免覆盖并发发布。
 */
const { resolve } = require('node:path');
const { CATALOG_FILES, validatePricingDirectory } = require('./update-pricing.cjs');

const REPOSITORY = 'Nancyingcode/token-usage';
const BRANCH = 'pricing';

const verifyParentCatalogs = async (parent, catalogs, request, validators) => {
  let foundCatalog = false;
  for (const [index, filename] of CATALOG_FILES.entries()) {
    const file = await request(`/contents/${filename}?ref=${parent}`, undefined, true);
    if (file === null) {
      continue;
    }
    if (file?.encoding !== 'base64' || typeof file.content !== 'string') {
      throw new Error(`Invalid parent catalog: ${filename}`);
    }
    const content = Buffer.from(file.content, 'base64');
    if (content.byteLength > validators.PRICING_MAX_BYTES) {
      throw new Error(`Oversized parent catalog: ${filename}`);
    }
    const previous = validators.decodePricingCatalog(
      JSON.parse(content.toString('utf8')),
      index + 1
    );
    validators.assertCatalogProgression(previous, catalogs[index]);
    foundCatalog = true;
  }
  if (!foundCatalog) {
    throw new Error('The pricing branch has no valid parent catalog.');
  }
};

const publishCatalog = async (rawCatalogs, request, validators) => {
  const validation = validators ?? (await require('./load-pricing-validator.cjs')());
  const catalogs = validation.validateCatalogVersions(rawCatalogs);
  const reference = await request(`/git/ref/heads/${BRANCH}`, undefined, true);
  const parent = reference?.object.sha;
  if (parent) {
    await verifyParentCatalogs(parent, catalogs, request, validation);
  }
  const tree = await request('/git/trees', {
    // 三个客户端协议必须来自同一快照，只有最终 ref 更新才对客户端可见。
    tree: catalogs.map((entry, index) => ({
      path: CATALOG_FILES[index],
      mode: '100644',
      type: 'blob',
      content: `${JSON.stringify(entry, null, 2)}\n`,
    })),
  });
  const commit = await request('/git/commits', {
    message: `chore(pricing): update catalog ${catalogs[0].version}`,
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
  const validators = await require('./load-pricing-validator.cjs')();
  const catalogs = await validatePricingDirectory(resolve('pricing'), validators);
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
  await publishCatalog(catalogs, request, validators);
};

module.exports = { publishCatalog };
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
