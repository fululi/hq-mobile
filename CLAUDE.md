# Claude Code 项目入口

进入本项目后，在分析、修改、运行测试或提交之前，必须依次完整阅读：

1. `AGENTS.md`
2. `/Users/xiaofulu/Documents/kimi/Workspaces/k线/做T台账/当前状态.md`
3. `/Users/xiaofulu/Documents/kimi/Workspaces/k线/做T台账/AI交接-龙头池整改.md`（该文件存在且状态为“待执行”或“执行中”时）
4. `/Users/xiaofulu/Documents/kimi/Workspaces/k线/做T台账/AI交接-做T档位纠偏-0910.md`（处理 S/B 档位、`tiers`、`ampBase`、`narrowBase` 或分票标定时必读）

## 接力规则

- 不要求用户复制其他 AI 会话的长文；以上共享文件是唯一交接入口。
- 开工前先在 `当前状态.md` 顶部写明“Claude 正在执行”、目标文件、准备修改的函数和当前远端基线。
- 若状态显示另一个会话正在修改同一仓库，立即停止，不得并行改库。
- 只处理专项交接中明确列出的范围；发现需要扩大范围，先写入交接文件的“待裁决”，不要自行扩项。
- 完成后把修改文件、函数、关键口径、测试结果、未解决项写回 `当前状态.md`，并将专项交接状态改为“本地完成待验收”。
- 未经用户当面许可，禁止 `git push`、`push_gh_api.py` 或任何远端写操作。
- 禁止读取 `/Users/xiaofulu/Documents/kimi/Workspaces/k线/_hq_work.html` 作为当前代码；它是 2026-09-08 的废弃快照。当前业务代码只认本仓库 `index.html`。

用户只说“读状态，继续”时，即表示按上述入口接续
