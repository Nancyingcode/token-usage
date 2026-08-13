/**
 * @file 依赖安装后的本地开发环境准备
 * @description 下载新版 Electron 的按需二进制，并继续配置仓库 Git hooks。
 */

require('electron');
require('./prepare-husky.cjs');
