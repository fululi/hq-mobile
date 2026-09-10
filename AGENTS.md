# hq-mobile 修改守则（给 AI 会话用）

线上: fululi.github.io/hq-mobile · 单文件 index.html（纯静态零后端，数据存 localStorage）

## 修改工作流（铁律）

1. 同一时间只许一个会话改库；改前 `git -c http.proxy=http://127.0.0.1:7897 pull --rebase origin main`。
2. **省 token 原则：不要全读 index.html（1500+ 行）。** 先用下方代码地图按函数名定位行号，只 `Read` 目标函数 ±10 行窗口；结构变了先更新本地图再动手。
3. 批量修改用一次性 `_bN.py` 精确字符串替换（每处 `assert count==1`），跑完即删。
4. 校验：正则提取内联 `<script>` 到 /tmp 再 `node --check`。
5. **口径回归：`node test_hq.js`（88 断言，从 index.html 抽 limitPct/tickOf/extTier/trendFlag/tiers/narrowBase/atrOf/ampBase/snapLv/todayPnlOf/settledRows/poolFreshOK 等真源码跑）。改上述计算口径前跑一遍，全绿再动手；口径有意变更先改断言并在 commit message 点名。ATR_FLOOR 拍板 0.9 落地时同步改 meta 断言。**
6. 无头 Edge 截图：`--user-data-dir=/tmp/edgehsN --window-size=492,844 --virtual-time-budget=9000 --screenshot=...`，后台跑+轮询文件+pkill。无头环境 localStorage 为空，持仓为空属正常。
7. 推送：`git -c http.proxy=http://127.0.0.1:7897 push origin HEAD:main`；推后 sleep 45 再 curl 验证线上文案。
8. 每次功能改动升 `<title>` 版本号。

## 数据口径速查

- 行情: 腾讯 `qt.gtimg.cn/q=代码`（JSONP,GBK）；日K: `web.ifzq.gtimg.cn/.../fqkline/get?param=代码,day,,,N,qfq`；15分K: Wind 1分钟聚合（`m15_wind_1min/`，全年），新浪/腾讯仅兜底。
- ATR14 缓存 `atr14_v1`（当日有效）；周/日趋势+极端区缓存 `hqm_wt_v6`；联动缓存 `hqm_lnk_v1`。
- 台账 `tlog_v2`，挂单 `tplan_v1`，未成交档案 `mlog_v1`，模拟仓 `paper_v1`，费率 `fee_v1`（佣金万2.5最低5元+印花税0.05%卖出）。
- 点价填单（v4.53 起）填到该票卡片快捷单(qs_/qb_/qq_)，不跳底部表单；档位%标注=较昨收；档位被今日高/低触及标"✓到过"。
- 做T分档（v4.52 起）**锚定昨收全天锁定**，基准=max(当日振幅, ATR14×0.75, 昨TR×0.6)，振幅扩大只向外加宽。VWAP水位带（v5.03 起）**单边日ratchet**：开盘15分VWAP钉为当日锚，单边跌(开盘-现价≥1ATR)卖点只上修不下挪，单边涨买点不上追。v5.13 起 `hqm_da_v1` 格式由纯数字改对象（`dayState()`），oneUp/oneDn/档位/到过(touch)按当日一次性事件持久化，不再每次渲染重算，也不再拿"今日高低点"倒推到过（旧写法在档位盘中变宽后会算错）。
- 今日盈亏口径（v5.13 起）`todayPnlOf()` 用现金流恒等式：现价×期末股数 + 今日成交现金流(卖-买-费) − 昨收×期初股数，取代 (现价-昨收)×当前股数（净加仓/净减仓/纯卖旧仓下旧公式失真），三处调用：卡片/ACCS账户小计/顶层#sum。
- 备份恢复（v5.14 起）`restoreJSON()` 台账(TLOG)按内容去重合并，不再整体覆盖丢多设备记录；持仓(holds)仍整体替换但恢复前 `confirm()` 展示差异摘要。
- 做T档位命中率沉淀（v5.13 起，尚未接入周报展示）`tfcast_v1`/`TFC`：`snapTier()` 每场次首次渲染时把 tr.sells/tr.buys/trendLv/legAge 写一次快照，`bindTierActual()` 在日K结算(`bindActual`同一回调)里回填当日高低是否触及各档，供后续按"平稳/趋势""刚转向/已趋势较久"分组统计命中率用。
- 记账联动（v4.52 起）：配对T 净利摊低成本；卖>接=减仓、接>卖=加仓；只卖不接按成本算实现盈亏；只买不卖加权摊成本。台账记录带 posBefore/posAfter，删/改自动还原持仓（之后又有变动则只删台账并提醒）。
- 文案原则：界面只显示客观事实，禁止"偏多/偏空/可进场"类主观标签；执行对照只说"卖高于挂单+X%"，不标优劣。

## 代码地图（v4.52 · 行号随版本漂移，以函数名为准用 grep 定位）

| 功能 | 函数/锚点 |
|---|---|
| 涨跌停/趋势/分档 | limitPct 318 · trendFlag 328 · tiers 336 · narrowBase 349 · ampBase 360 |
| ATR/日K解析 | parseIfzq 412 · parseSina 430 · loadATR 595 |
| 周线/极端区/结论 | loadWTrend 539 · extTxt 500 · verdict 501 |
| 联动测算 | computeLink 451 |
| 15分三角 | loadM15 514 |
| 主力净流入 | loadFF 626 · loadFFH 647 |
| 行情刷新主流程 | refresh 737 · render 1332 |
| 做T计划表 | renderT 968（ann() 档位净赚标注在内） |
| 挂单计划 | addPlan 803 · renderPlan 815 · fillPlan 846 · copyOrders 861 · sweepPlans 266 |
| 记一笔/单边/联动 | maybeConfirmT_ 882 · addTrade 1037 · qPrev/qTrade(卡片快捷) 1004/1024 |
| 面板/档案 | renderDayChg(今日仓位变动) · renderClosed(清仓档案) · anchorOf/anchorNote(跳空锚) |
| 台账/复盘 | renderLog 1220（按日分组+腿状态在内） · delTrade 1144 · editTrade 1151 · revertPos 1136 |
| 导出/备份 | exportCSV 1166 · backupJSON 1197 · restoreJSON 1204 · copyCoach 1114 |
| 模拟建仓 | triDet 1483 · paperScan 1511 · renderPaper 1520 |
| 添加/删除股 | confirmAdd 931 · doAdd 922 · delItem 948 · editField 953 |
| 场次账/预测快照(v4.98+) | snapFcast/fcOf/bindActual/settledRows(anchorNote 前) · LASTK · targetDay/sessState · actRow(实际行四态) · renderFcast(预判复盘卡v5.07,fcast_v1沉淀+周度准确率) · fibLine(斐波那契回调位,段内高低点口径,ATR缓存已升atr14_v2) · preHitOf 三处调用已套 settledRows 剔除未完成日K |


---

## 推送红线（2026-09-07 用户亲定，最高优先级，覆盖一切其他约定）

1. 任何 AI agent（Kimi / Claude Code / Codex / 其他任何 agent）未经用户当面许可，禁止 `git push`、`push_gh_api.py` 及任何写远端的操作。改动只落本地文件 + 交接文档，由用户确认后走统一推送通道。
2. 动手改库前先审计：`gh api repos/fululi/<repo>/commits?per_page=3`，发现本人交接文档未记录的陌生 commit → 立即停手并报告用户。
3. 审计基线（2026-09-10 12:50 更新）：hq-mobile = `1619415a`（v5.195 顶栏溢出真修+actnow三态+金龙池交易日口径等12项，房主中午连环单）· k-station = `7d0db468`（ks-0910-44 右端三角防撞）。每次合法推送后更新本行。


---

## 错账收集（2026-09-09 用户亲定，一切会话的硬习惯）

干活中出了任何错——代码 bug、数量算错、资金流取错、脏数据、口径搞混、记忆记错——**当场**追加一行到：

`/Users/xiaofulu/Documents/kimi/Workspaces/k线/做T台账/错账收集.jsonl`

格式（一行一个 JSON，只 append 不改旧行）：
`{"date":"YYYY-MM-DD","source":"哪个会话/哪个agent","kind":"代码|数量|资金流|脏数据|口径|记忆|流程","what":"一句话错在哪"}`

自己不清楚、拿不准的低级问题也要写，不许瞒。每日 16:53「每日复盘」自动化自动汇总进复盘卡，并重写记忆库「近期错账」块——新窗口开场即见，不用重新复盘。取数铁律见记忆库 [[数据源优先级]]：优先付费 Wind/iFinD，一次失败要换姿势自救，找不到不许说搞不定。

## 一次改完再验（2026-09-09 用户亲定，反"跑测循环"）

接到一件事先把所有相关问题一次想清楚、一次改全，最后一遍验证收尾。禁止"改一点→跑一次→再改→再跑"：每次自动化运行/推送/实跑都在烧钱。正确顺序：需求一次列全 → 代码一次写完 → 本地零成本静态检查（node --check 等）→ 1 次实跑验收 → 交付。挂了修完再跑 1 次；还挂就停手报告，不许继续烧。


## 汇报纪律（2026-09-09 用户亲定，反刷屏）

动手前一次想全（需求/边界/依赖/风险），中间不刷屏，不要每完成一步就发一条汇报；全部干完一次性交付汇报。只有两种情况允许中途说话：①卡住需要用户决策 ②不可逆/破坏性操作前按红线确认。

---

## 状态文件第一入口（2026-09-09 用户亲定）

干活进展写进状态文件 `/Users/xiaofulu/Documents/kimi/Workspaces/k线/做T台账/当前状态.md`，且到细节级——改了哪个文件哪处、关键数字/版本、做了什么决定、下一步是什么、有什么坑。只写"做了X"不算数，读的人凭它就能接续。想知道发生了什么，先读状态文件，不是聊天记录；状态文件真缺的细节再回去看上下文。子 Agent 跑长任务前必须先把"此刻正在跑"一节写好，跑中关键节点随手更新。

## 验证成本纪律（2026-09-09 用户亲定，反"截图烧钱"）

1. 验证顺序：node --check（零成本）→ DOM/JS 探针（几十 token）→ 最后一次截图目验收尾。禁止"改一点截一张、来回复查"。
2. 截过的图当场归档到 `做T台账/验收图-MMDD/`，后续引用复用，禁止为同一画面重复截图。
