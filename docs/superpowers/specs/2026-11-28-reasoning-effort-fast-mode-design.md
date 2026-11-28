# 思考强度与 Fast 模式接入设计

设计已确认。首版让用户在会话详情看到各档思考强度用了多少 Token，以及这个线程何时设置过 Fast。应用沿用只读用量分析的定位，速度和强度仍由用户在 Codex 中选择。[实施计划](../plans/2026-11-28-reasoning-effort-fast-mode.md)

## 日志里能看到什么

2026-11-28 在本机只读抽样。按修改时间倒序，选取末次回合生命周期事件为完成、最后写入距抽样至少 30 分钟的 220 个 JSONL 文件，入选文件来自 11 月 21 至 28 日目录。以下仅为结构化字段的汇总，样本中的配置分布不能外推到其他用户或客户端版本。

| 想知道的事 | 本机证据 | 可提供的功能 |
| --- | --- | --- |
| 某一轮选择了什么思考强度 | 按文件内的 `turn_id` 去重后，1,511 个回合都能读到 `turn_context.payload.effort`，其中 `low` 1,004 个、`max` 225 个、`ultra` 282 个 | 按回合显示强度，汇总可归属到该轮的用量 |
| 线程设置过什么速度 | `event_msg` 中的 `thread_settings_applied` 有 1,560 条快照，`payload.thread_settings.service_tier` 为 `default` 的有 1,111 条，为 `priority` 的有 449 条。7 个线程出现过两档 | 显示“标准”“Fast”和切换顺序。连续相同的快照只显示一次 |
| 某次请求是否按 Fast 执行 | 检查的会话元数据、回合上下文、事件和响应项里，均未找到可关联到请求的实际服务档位。28 条线程设置快照出现在活跃回合已经产生用量之后 | 该请求的实际档位显示“未记录”。快照条数不能用来计算 Fast 请求数或费用 |

本机 Codex CLI `0.171.0-alpha.13.2` 的 App Server 类型允许在 `TurnStartParams.serviceTierForTurn` 中临时覆盖一轮速度，同时保留线程设置。样本未发现这个单轮覆盖字段。官方文档也区分模型的思考强度、生成速度和 API 实际服务档位，响应使用的档位可能与请求值不同。[Codex 配置参考](https://developers.openai.com/codex/config-reference/) · [Codex 速度设置](https://developers.openai.com/codex/speed/) · [Responses API 的服务档位](https://developers.openai.com/api/reference/resources/responses/methods/create)

## 首版的会话详情

- **思考强度**按档列出回合数、总 Token 和其中的推理输出 Token。例如在同一会话从 `low` 切到 `ultra` 时，两档分别列出。推理输出属于输出 Token 的明细，只展示一次。强度名称使用日志值，兼容不同模型支持的档位。
- **线程速度设置**显示最后一次有记录的设置，发生过变化时可展开查看时间和切换顺序，例如“标准 → Fast → 标准”。旁边注明“实际服务档位未记录”。这里的 `priority` 表示 Fast 设置，`default` 表示标准设置。`ultrafast` 单独展示，其他陌生档位保留其标识，缺失或空值显示“未记录”。
- 从每个会话都能打开详情，包括没有诊断结果的会话。宽、窄窗口共用键盘可达的入口。现有窄窗口的行详情可以复用，宽窗口也要提供入口。新增文案同时维护简体中文和英文。[会话列表](../../../src/renderer/components/SessionsView.tsx) · [现有列表布局设计](2026-11-27-compact-usage-tables-design.md)

## 用量如何归属

1. 主进程按文件顺序解析。从本轮 `turn_context` 取思考强度，把能明确归属本轮的增量用量 `last_token_usage` 计入该档。一轮可以产生多条用量记录，回合数按回合身份去重。能识别的回合即使用量未记录也计一轮，只有用量字段明确为零时才展示零。
2. 遇到没有强度、回合边界不明或归属冲突的切片，将其 Token 计入“未知”。只有整场累计 `total_token_usage` 时，全量保留在“未知”用量中，有明确回合配置的仍可展示回合数。各档和“未知”的 Token 相加应等于会话总量。当前全局配置、模型名、耗时和推理 Token 数都不能补出历史设置。[解析器](../../../src/main/sessionParser.ts) · [用量类型](../../../src/shared/usageTypes.ts)
3. 线程速度设置按事件的 `thread_id` 和文件内顺序记录，保留初次观测与后续变化。历史中有 49 条快照的线程 ID 与前方最近一次 `session_meta.id` 不同，但与其 rollout 文件标识相符。解析分叉或继承历史时应核对所属线程，身份不明确时保留未知。晚到的快照不回填此前记录，重复刷新不重复追加。
4. 同一套主进程解析覆盖普通 JSONL 和已导入的压缩会话。升级扫描缓存版本并从可用原文重建，已有类型化用量 IPC 即可把结果交给界面。首版仅增加会话分析数据，费用索引无需携带线程设置历史。[扫描缓存](../../../src/main/usageScanCacheStore.ts) · [压缩会话存储](../../../src/main/compressedSessionStore.ts) · [preload 用量接口](../../../src/preload/preload.ts)

## Fast 何时可以参与费用估算

现有条件计价器已经支持 Fast。要启用自动计价，需要同时具备能与该笔用量匹配的**响应级服务档位**和**该模型已核验的对应费率**。两者具备时进入现有逐请求计算，再汇总到预算和费用视图。仅有线程设置或单轮请求设置时，沿用现有的参考估算和条件缺失提示。缺少单价的 Token 保留为未计价，用户手动平价沿用原有选择。[条件计价设计](2026-09-10-conditional-pricing-design.md) · [计价器](../../../src/shared/conditionalPricing.ts) · [现有回归测试](../../../tests/conditionalUsage.test.ts)

思考强度不引入费用倍率。当前仓库内置的 Fast 条件只覆盖 `gpt-6-astra`，其他模型应核对各自的价格目录和适用分项。应用展示按 API 价格计算的本地估算，ChatGPT 订阅额度和积分有各自的使用规则。[内置模型条件](../../../src/shared/modelPricingConditions.ts) · [联网价格目录](../../network-pricing.md) · [Codex 费用口径](https://developers.openai.com/codex/speed/#api-billing)

## 验收

- 用合成日志覆盖同一会话换强度、一轮多个请求、无用量回合、累计回退、缺字段和未知新档位。对账各强度分组与会话总量，验证思考强度不改变费用。
- 用合成日志覆盖标准切 Fast 再切回、重复快照、首条设置晚于用量、分叉线程及整场无快照。仅凭线程设置为 Fast 时，实际档位仍未知，费用计算沿用原路径。
- 验证普通文件、已导入的压缩文件、旧缓存重建和重复扫描结果一致。在宽屏和 1024 × 680 窗口验证会话详情、键盘展开和焦点恢复。
