## Key Documentation

- [Coding Standards](./style-guide.md): definitive guide for running targets.

## 4. Code Style（代码风格规范）

### 4.1 通用规则

- 禁止使用：any 类型、var 声明、硬编码魔法值（如直接写 100 代替 MAX_PAGE_SIZE）

### 4.2 React+TS 专属规则

- 组件风格：优先使用函数式组件（React.FC），禁止使用类组件
- 类型定义：使用 interface 定义组件 props，简单场景可使用 type
- 命名规范：
  - 组件名：PascalCase（如 UserList）
  - 函数名：camelCase（如 handleUserClick）
  - 常量名：UPPER_CASE_SNAKE_CASE（如 MAX_PAGE_SIZE）
- 示例：

```ts
// 正确示例
interface UserListProps {
  users: Array<{ id: number; name: string }>;
}
export const UserList: React.FC<UserListProps> = ({ users }) => {
  const handleClick = (id: number) => {
    console.log(`User ID: ${id}`);
  };
  return (
    <div className="user-list">
      {users.map(user => (
        <button key={user.id} onClick={() => handleClick(user.id)}>
          {user.name}
        </button>
      ))}
    </div>
  );
};
```

- JSX/DOM 内部的渲染判断如果组合两个或更多业务谓词，应优先提取为具名布尔变量或纯函数；多个互斥界面分支应建立明确的渲染状态模型。只有条件具有独立生命周期并由事件直接改变时，才定义为 React state，禁止保存可由 props 或现有 state 推导出的重复状态。

```ts
// 错误示例
type ViewKey = 'overview' | 'wrapped';

interface WarningBadgeProps {
  view: ViewKey;
  count: number;
}

export const WarningBadge: React.FC<WarningBadgeProps> = ({ view, count }) => (
  <>{view === 'wrapped' && count > 0 ? <em className="nav-badge">{count}</em> : null}</>
);
```

```ts
// 正确示例
type ViewKey = 'overview' | 'wrapped';

interface WarningBadgeProps {
  view: ViewKey;
  count: number;
}

const shouldShowWarningBadge = (view: ViewKey, count: number): boolean =>
  view === 'wrapped' && count > 0;

export const WarningBadge: React.FC<WarningBadgeProps> = ({ view, count }) => {
  const showWarningBadge = shouldShowWarningBadge(view, count);

  return <>{showWarningBadge ? <em className="nav-badge">{count}</em> : null}</>;
};
```

### 4.3 注释规则

## 建议写注释的内容

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

废弃代码应该直接删除，Git 已经保存了历史记录。

### 4.4 文件头

- [文件头规范](./rules/file-header.md)
