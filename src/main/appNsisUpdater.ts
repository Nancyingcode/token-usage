/**
 * @file NSIS 更新状态兼容边界
 * @description 仅重置上游明确开放给子类的内存状态，不修改安装文件、缓存路径或默认签名验证。
 */
import electronUpdater from 'electron-updater';

export class AppNsisUpdater extends electronUpdater.NsisUpdater {
  resetInstallAttempt(): void {
    // 上游异步 spawn 失败不会复位安装去重标记；待上游保证失败后可直接重试时删除此兼容方法。
    this.quitAndInstallCalled = false;
  }

  forgetDownloadedUpdate(): void {
    // 上游对本进程已下载的缓存只检查存在性；重新创建 helper 才会校验磁盘摘要，且由上游管理坏缓存。
    // 待上游对内存命中的缓存也复验摘要时删除此兼容方法。
    this.downloadedUpdateHelper = null;
  }
}
