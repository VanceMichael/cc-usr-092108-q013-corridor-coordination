# 跨区域通道协同清障

把跨区域通道的区段、部门、资源要素和依赖记录整理成可计算的协同产品：管理者看到的不再是"推进中"这类模糊描述，而是可计算的堵点、风险传播链和综合效能；任何完成声明都能下钻到许可、工程与联调证据。

## 两层资料

- **领域资料**：`contracts/context.schema.json` + `fixtures/context.json`，记录领域参与者、事实与约束（为什么做）。
- **协同产品模型**：`contracts/corridor.schema.json` + `fixtures/corridor.json`，结构化的协同台账（做什么、怎么算）。样例为虚构的"北湾—青屿"跨海通道，不含真实个人信息、账号、密钥或连接凭据。

## 产品能力

| 能力 | 实现 |
| --- | --- |
| 依赖图容纳七类节点 | `src/ledger.js`：通道结构、许可、标准、资金、施工前置、算力数据设施、韧性措施 |
| 堵点计算 | `src/graph.js` `computeBlockages`：硬前置未满足即被卡，根因穿透到用地、用海、用能、生态、地方标准、配套网络等要素 |
| 法规与标准变更传播 | `src/graph.js` `propagateChange`：沿依赖边自动列出受影响节点与传播路径 |
| 地方承诺有效性 | `src/ledger.js` `commitmentValidity`：责任人、截止日、依据、受影响节点四要素齐全才算有效 |
| 方案版本保留 | `src/plans.js`：延期、替代路线、争议裁决、灾害重排都生成新版本，被替换方案保留可回溯 |
| 灾害重排与服务恢复 | `src/plans.js` `rescheduleForDisaster` / `recordRecoveryStage` |
| 多方同时更新 | `src/updates.js` `applyNodeUpdate`：基于版本号的乐观并发，过期基线被拒绝 |
| 跨时区会议决定 | `src/updates.js` `orderMeetings`：按 UTC 瞬时排序而非当地时钟读数 |
| 敏感工程字段 | `src/updates.js` `redactLedger`：字段级密级，按许可级别遮蔽 |
| 区域汇总 | `src/rollup.js`：只引用不修改原始结论，矛盾结论并列保留 |
| 完成声明核验 | `src/claims.js`：许可、工程、联调三类证据齐全才成立，可逐条下钻 |
| 综合效能 | `src/effectiveness.js`：满足率、承诺兑现率、证据完备率及综合分 |

## 计算口径

- 节点状态：`pending / in-progress / satisfied / failed / suspended`，只有 `satisfied` 视为已满足。
- 依赖边分硬前置与软关联：只有硬前置参与阻断；风险传播沿所有边进行。
- 堵点根因：本身未满足、且没有未满足硬前置的节点——即真正卡住的资源要素。
- 承诺逾期需要显式传入基准日，避免结果随运行时间漂移。
- 综合效能 =（节点满足率 + 承诺兑现率 + 证据完备率）/ 3，三个分量均可独立复算。

## 本地校验

`npm test` 运行全部测试：样例台账可读、承诺有效性、堵点与传播、版本保留、并发冲突、时区排序、字段遮蔽、区域汇总、证据下钻与效能口径。
