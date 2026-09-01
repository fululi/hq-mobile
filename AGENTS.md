# hq-mobile 修改守则（给 AI 会话用）

线上: fululi.github.io/hq-mobile · 单文件 index.html（纯静态零后端，数据存 localStorage）

## 修改工作流（铁律）

1. 同一时间只许一个会话改库；改前 `git -c http.proxy=http://127.0.0.1:7897 pull --rebase origin main`。
2. **省 token 原则：不要全读 index.html（1500+ 行）。** 先用下方代码地图按函数名定位行号，只 `Read` 目标函数 ±10 行窗口；结构变了先更新本地图再动手。
3. 批量修改用一次性 `_bN.py` 精确字符串替换（每处 `assert count==1`），跑完即删。
4. 校验：正则提取内联 `<script>` 到 /tmp 再 `node --check`。
5. 无头 Edge 截图：`--user-data-dir=/tmp/edgehsN --window-size=492,844 --virtual-time-budget=9000 --screenshot=...`，后台跑+轮询文件+pkill。无头环境 localStorage 为空，持仓为空属正常。
6. 推送：`git -c http.proxy=http://127.0.0.1:7897 push origin HEAD:main`；推后 sleep 45 再 curl 验证线上文案。
7. 每次功能改动升 `<title>` 版本号。

## 数据口径速查

- 行情: 腾讯 `qt.gtimg.cn/q=代码`（JSONP,GBK）；日K: `web.ifzq.gtimg.cn/.../fqkline/get?param=代码,day,,,N,qfq`；15分K: 新浪 scale=15。
- ATR14 缓存 `atr14_v1`（当日有效）；周/日趋势+极端区缓存 `hqm_wt_v6`；联动缓存 `hqm_lnk_v1`。
- 台账 `tlog_v2`，挂单 `tplan_v1`，未成交档案 `mlog_v1`，模拟仓 `paper_v1`，费率 `fee_v1`（佣金万2.5最低5元+印花税0.05%卖出）。
- 点价填单（v4.53 起）填到该票卡片快捷单(qs_/qb_/qq_)，不跳底部表单；档位%标注=较昨收；档位被今日高/低触及标"✓到过"。
- 做T分档（v4.52 起）**锚定昨收全天锁定**，基准=max(当日振幅, ATR14×0.75, 昨TR×0.6)，振幅扩大只向外加宽。
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
