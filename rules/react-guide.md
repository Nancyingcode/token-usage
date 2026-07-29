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