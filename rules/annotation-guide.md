### 1\. 复杂业务规则

当代码背后有特殊业务含义时，需要说明规则来源和原因。
```typescript
// 企业认证通过后仍需等待柜面数据同步，不能立即开放提现功能
if (certified&&counterStatus==='SYNCED') {
  enableWithdraw();
}
```

### 2\. 不直观的实现方案

代码看起来可以简化，但实际上是为了兼容性、性能或稳定性。

```TypeScript
// 使用 setTimeout 将操作放到下一轮任务，避免组件卸载时更新状态
setTimeout(() => {
  updateStatus();
}, 0);
```


### 3\. 临时方案和技术债

需要说明为什么临时处理、后续如何修改，最好关联任务编号。

```TypeScript
// TODO: 等后端接口支持分页后，删除前端截取逻辑
// 关联任务：CMS-1024
constvisibleList=list.slice(0, 100);
```

常见标记：

```TypeScript
// TODO: 待实现或待优化
// FIXME: 已知问题，需要修复
// HACK: 非理想的临时实现
// NOTE: 需要特别注意的信息
```

### 4\. 边界条件和异常处理

说明为什么某些特殊情况需要单独处理。

```TypeScript
// 接口可能返回 null，统一转换为空数组，避免列表组件报错
constrecords=response.records ?? [];
```

### 5\. 算法或复杂逻辑

例如递归、位运算、复杂正则、缓存策略、并发控制等。

```TypeScript
// 从后向前遍历，避免删除元素后导致后续索引发生变化
for (leti=list.length -1; i>=0; i--) {
  if (shouldRemove(list[i])) {
    list.splice(i, 1);
  }
}
```

### 6\. 公共方法、组件和接口

公共能力建议使用 JSDoc，说明用途、参数、返回值和异常。

```TypeScript
/**
 * 获取当前用户可访问的菜单列表
 * @param routes 系统完整路由
 * @param permissions 用户权限标识
 * @returns 过滤后的可访问路由
 */
function filterRoutes(
  routes: Route[],
  permissions: string[]
): Route[] {
  // ...
}
```

### 7\. 第三方库或浏览器兼容处理

```TypeScript
// Safari 不支持该文件类型的直接预览，因此降级为下载
if (isSafari&&fileType==='docx') {
  downloadFile(url);
}
```

### 8\. 与外部系统有关的限制

例如后端约定、支付回调、第三方 SDK、旧系统兼容。

```TypeScript
// 支付回调可能重复触发，必须通过订单号保证幂等
if (processedOrderIds.has(orderId)) {
  return;
}
```

### 9\. 文件或模块职责

文件头可以简要说明模块用途，但不建议写作者、创建日期等容易过期的信息。

```TypeScript
/**
 * CMS 内容发布模块
 * 负责草稿校验、版本创建、发布状态轮询和异常恢复
 */
```

## 通常不需要写注释的内容

不要给一眼就能看懂的代码添加无意义注释：

```TypeScript
// 用户名
const username=user.name;

// 判断是否登录
if (isLogin) {
  // 跳转首页navigate('/');
}
```

也不要用注释保留废弃代码：

```TypeScript
// const oldData = getOldData();// handleOldData(oldData);
```

废弃代码应该直接删除，Git 已经保存了历史记录