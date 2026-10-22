/**
 * @file 正式签名的草稿构建配置
 * @description 继承现有 NSIS 身份，缺少证书或发布者即停止；是否上传仍由显式草稿脚本决定。
 */
const { createReleaseConfiguration } = require('./scripts/release-utils.cjs');

module.exports = createReleaseConfiguration(process.env);
