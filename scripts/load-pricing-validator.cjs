/**
 * @file 价格校验器脚本桥接
 * @description 使用项目已有 Vite 工具链加载客户端同一校验器，避免发布端与客户端规则漂移。
 */
const { resolve } = require('node:path');

module.exports = async () => {
  const { build } = await import('vite');
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: resolve(__dirname, '../src/shared/pricingCatalog.ts'), formats: ['es'] },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunk = outputs
    .flatMap((output) => output.output)
    .find((output) => output.type === 'chunk' && output.isEntry);
  if (!chunk) {
    throw new Error('Pricing validator could not be built.');
  }
  return import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
};
