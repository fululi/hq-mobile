// test_hq.js — hq-mobile 计算口径回归测试
// 原则: 直接从 index.html 抽取真源码跑断言, 不是重新实现——口径改动当场现形。
// 用法: node test_hq.js   （改任何计算口径前必跑, 见 AGENTS.md）
// 注意: 期望值是手工独立核算的"钉"; 若口径有意变更, 先改断言再改代码, 并在 commit message 说明。
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// ---- 真源码抽取: function 名 + 花括号配对(跳过字符串/注释) ----
function extractFn(name) {
  const m = SRC.match(new RegExp('function\\s+' + name + '\\s*\\('));
  if (!m) throw new Error('index.html 里没找到 function ' + name);
  let i = SRC.indexOf('{', m.index), depth = 0, j = i;
  let str = null, com = null; // str: ' " ` ; com: // 或 /*
  for (; j < SRC.length; j++) {
    const c = SRC[j], n2 = SRC[j + 1];
    if (com === '//') { if (c === '\n') com = null; continue; }
    if (com === '/*') { if (c === '*' && n2 === '/') { com = null; j++; } continue; }
    if (str) { if (c === '\\') { j++; continue; } if (c === str) str = null; continue; }
    if (c === '/' && n2 === '/') { com = '//'; j++; continue; }
    if (c === '/' && n2 === '*') { com = '/*'; j++; continue; }
    if (c === "'" || c === '"' || c === '`') { str = c; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) return SRC.slice(m.index, j + 1); }
  }
  throw new Error('function ' + name + ' 花括号没配对完');
}
const FNS = ['today','ymd','lastTradeDay','poolFreshOK','poolCacheOK','cls','limitPct','tickOf','extTier','nextAbove','nextBelow',
             'trendFlag','snapLv','tiers','liveTiers','tierProfileLabel','narrowBase','atrOf','ampBase','poolEvidence','poolGate','poolEligible','poolIntentEvidence','poolAutoObserveEligible','poolDateText','poolCacheDecision','todayPnlOf','settledRows','fibAboveOf'];
const bundle = FNS.map(extractFn).join('\n');

// ---- 沙箱: 假 Date 可控时间; TLOG/ATR/planNext 可注入 ----
function makeCtx(fixed) { // fixed: [y,m,d,h,mi] 本地时间
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a){ super(...(a.length ? a : fixed)); }
    static now(){ return new RealDate(...fixed).getTime(); }
  }
  const ctx = {
    Date: FakeDate, Math, JSON, console,
    TLOG: [], ATR: {}, DANCH:{}, _planNext: false,
    K_UP: 0.3, K_DN: 0.5, ATR_FLOOR: 0.9, // 与 index.html:703 一致(下方有 meta 断言盯住)
  };
  vm.createContext(ctx);
  vm.runInContext('function planNext(){ return _planNext; }', ctx);
  vm.runInContext('function dayState(c){ return DANCH[c]||(DANCH[c]={tierAnchorType:null,tierAnchorPrice:null,tierSells:[],tierBuys:[]}); } function saveDanch(){}', ctx);
  vm.runInContext(bundle, ctx);
  return ctx;
}
const EPS = 1e-9;
let PASS = 0, FAIL = 0; const ERRS = [];
function ok(cond, name) { if (cond) { PASS++; } else { FAIL++; ERRS.push(name); console.log('  ✗ ' + name); } }
function eq(a, b, name) { ok(typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : a === b,
  name + '  [期望 ' + JSON.stringify(b) + ' 实得 ' + JSON.stringify(a) + ']'); }
function arrEq(a, b, name) { ok(Array.isArray(a) && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-6),
  name + '  [期望 ' + JSON.stringify(b) + ' 实得 ' + JSON.stringify(a) + ']'); }

// ================= limitPct 板块涨跌停 =================
console.log('— limitPct —');
{
  const c = makeCtx([2026, 8, 10, 14, 0]), f = vm.runInContext('limitPct', c);
  eq(f('sh600105', '永鼎股份'), 10, '主板普通 10%');
  eq(f('sz300750', '宁德时代'), 20, '创业板300 20%');
  eq(f('sz301308', '江波龙'), 20, '创业板301 20%');
  eq(f('sh688981', '中芯国际'), 20, '科创板688 20%');
  eq(f('sh689009', '华润微'), 20, '科创板689 20%');
  eq(f('sh588000', '科创50ETF'), 20, '588科创ETF 20%(T3修)');
  eq(f('sz920001', '北证票'), 30, '北交所920 30%');
  eq(f('sh600112', 'ST天成'), 5, '主板ST 5%');
  eq(f('sz300999', 'ST创业'), 20, '创业板ST仍20%(板块优先于ST)');
  eq(f('sz159915', '创业板ETF'), 10, '159段保守10%(宁多clip勿外推)');
  eq(f('sh515880', '通信ETF'), 10, '51段ETF 10%');
}

// ================= tickOf 最小报价单位 =================
console.log('— tickOf —');
{
  const c = makeCtx([2026, 8, 10, 14, 0]), f = vm.runInContext('tickOf', c);
  eq(f('sh515880'), 0.001, 'sh51 ETF tick=0.001');
  eq(f('sh588000'), 0.001, 'sh58 ETF tick=0.001');
  eq(f('sz159915'), 0.001, 'sz15 ETF tick=0.001');
  eq(f('sh600105'), 0.01, '股票 tick=0.01');
  eq(f('sz001309'), 0.01, '深主板股票 tick=0.01');
}

// ================= extTier 延伸档 =================
console.log('— extTier —');
{
  const c = makeCtx([2026, 8, 10, 14, 0]), f = vm.runInContext('extTier', c);
  eq(f([42, 43], 'sell', 40, 'sh600105', '永鼎'), 44, '卖侧外推一格 43+1=44');
  eq(f([43.5, 43.9], 'sell', 40, 'sh600105', '永鼎'), 44, '卖侧外推超涨停被clip到44');
  eq(f([44], 'sell', 40, 'sh600105', '永鼎', 0.5), null, '已贴涨停不外推(null)');
  eq(f([38, 37], 'buy', 40, 'sh600105', '永鼎'), 36, '买侧外推一格 37-1=36');
  eq(f([36], 'buy', 40, 'sh600105', '永鼎', 0.5), null, '已贴跌停不外推(null)');
  eq(f([42, 43], 'sell', 0, 'sh600105', '永鼎'), null, '昨收缺失不出延伸');
  eq(f([], 'sell', 40, 'sh600105', '永鼎'), null, '空档数组不出延伸');
}

// ================= nextAbove / nextBelow 越档后下一目标(v5.195) =================
console.log('— nextAbove/nextBelow —');
{
  const c = makeCtx([2026, 8, 10, 14, 0]);
  const fa = vm.runInContext('nextAbove', c), fb = vm.runInContext('nextBelow', c);
  eq(fa([42, 43], 43.6, 40, 'sh600105', '永鼎'), 44, '越过顶档→外推到44(真在现价上方)');
  eq(fa([43.00, 43.50], 44.50, 42.67, 'sh600176', '中国巨石'), 45, '连穿外推档→再推到45(巨石实案:44.5穿S4延43.79,涨停46.94还有空间)');
  eq(fa([42, 43], 44.5, 40, 'sh600105', '永鼎'), null, '现价44.5已超涨停44=不可能场景,外推不出→null');
  eq(fa([43.5, 43.9], 43.95, 40, 'sh600105', '永鼎'), 44, '外推被clip到涨停44仍可用');
  eq(fa([44], 43.5, 40, 'sh600105', '永鼎'), 44, '原档序列里还有没越过的直接用');
  eq(fa([44], 44.5, 40, 'sh600105', '永鼎', 0.5), null, '贴涨停外推不出→null(直逼涨停)');
  eq(fa(null, 43, 40, 'sh600105', '永鼎'), null, '空档数组null');
  eq(fb([38, 37], 36.5, 40, 'sh600105', '永鼎'), 36, '买侧跌穿→外推到36');
  eq(fb([36.5], 37, 40, 'sh600105', '永鼎'), 36.5, '买侧原档未越直接用');
  eq(fb([36], 35.5, 40, 'sh600105', '永鼎', 0.5), null, '贴跌停外推不出→null(不接飞刀)');
}

// ================= poolCacheOK 金龙池缓存交易日口径(v5.195) =================
console.log('— poolCacheOK —');
{
  const c1 = makeCtx([2026, 8, 10, 14, 0]); // 周四
  const f1 = vm.runInContext('poolCacheOK', c1);
  eq(f1('2026-09-10'), true, '当日池接着用');
  eq(f1('2026-09-07'), true, '隔3个交易日接着用(停更期不白扫)');
  eq(f1('2026-08-28'), false, '隔9个交易日太旧重扫');
  eq(f1(''), false, '空不用'); eq(f1(null), false, 'null不用');
  eq(f1('20260910'), true, 'yyyymmdd格式也认');
  const c2 = makeCtx([2026, 8, 14, 8, 30]); // 周一早晨
  eq(vm.runInContext('poolCacheOK', c2)('2026-09-11'), true, '周一早晨认周五的池子(核心修复)');
  const c3 = makeCtx([2026, 9, 3, 10, 0]); // 国庆假期中(周六)
  eq(vm.runInContext('poolCacheOK', c3)('2026-09-30'), true, '假期中不白扫(节前池子接着看)');
}

// ================= fibAboveOf fib磁吸位(v5.196 巨石实案: 44.50上方最近=0.786@45.10) =================
console.log('— fibAboveOf —');
{
  const c = makeCtx([2026, 8, 10, 14, 0]);
  c.M15FIB = { sh600176: { leg: { dir: -1, a: 47.08, lv: [['0.382',41.37],['0.5',42.46],['0.618',43.55],['0.786',45.10]] } } };
  const f = vm.runInContext('fibAboveOf', c);
  let r = f('sh600176', 44.50);
  eq(r && r.v, 45.10, '巨石实案: 44.50上方磁吸=0.786'); eq(r && r.tag, '0.786', '磁吸标签=0.786');
  r = f('sh600176', 45.20);
  eq(r && r.v, 47.08, '越过0.786后上看段高'); eq(r && r.tag, '段高', '段高标签');
  eq(f('sh600176', 47.20), null, '段高之上无磁吸=null');
  eq(f('sh600176', null), null, '价null=null'); eq(f('sh600176', 0), null, '价0=null');
  c.M15FIB = { sh600176: { leg: { dir: 1, b: 50 } } }; // 上行腿
  r = f('sh600176', 49); eq(r && r.v, 50, '上行腿看段高b');
  eq(f('sh600176', 51), null, '上行腿段高之上=null');
  c.M15FIB = {}; eq(f('sh600176', 44), null, '无缓存=null');
  const c2 = makeCtx([2026, 8, 10, 14, 0]); // M15FIB 未定义(守卫)
  eq(vm.runInContext('fibAboveOf', c2)('sh600176', 44), null, 'M15FIB未定义不炸=null');
}

// ================= trendFlag 趋势升档 =================
console.log('— trendFlag —');
{
  const c = makeCtx([2026, 8, 10, 14, 0]), f = vm.runInContext('trendFlag', c);
  eq(f(null, null, null).lv, 0, '无数据 lv0');
  eq(f(2, 2, 0).lv, 0, '+2% 普通 lv0');
  let r = f(3.5, 4, 0); eq(r.lv, 1, '+3.5% lv1'); eq(r.label, '涨超3%', 'lv1标签=涨超3%');
  r = f(-6.5, 7, 0); eq(r.lv, 2, '-6.5% lv2'); eq(r.label, '⚠跌超6%', 'lv2标签=跌超6%');
  r = f(1, 5.2, 0); eq(r.lv, 1, '振幅5.2%升lv1'); eq(r.label, '振幅5.2%', '振幅触发不冒名涨超3%(T5⑥)');
  r = f(1, 8.3, 0); eq(r.lv, 2, '振幅8.3%升lv2'); eq(r.label, '⚠振幅8.3%', 'lv2振幅标签');
  r = f(1, 2, -1.5); eq(r.lv, 1, '大盘-1.5%升lv1'); eq(r.label, '大盘异动', '大盘触发标签=大盘异动');
}

// ================= snapLv 磁吸 =================
console.log('— snapLv —');
{
  const c = makeCtx([2026, 8, 10, 14, 0]), f = vm.runInContext('snapLv', c);
  arrEq(f([40.6], [], 2), [40.6], '无磁吸位原样返回');
  arrEq(f([39.50], [{ v: 39.93, pri: 2 }], 2.5), [39.93], '容差内吸附真压力位(39.93教训)');
  arrEq(f([39.50], [{ v: 39.93, pri: 2 }], 2), [39.50], '超容差(tol=0.36<0.43)不吸附');
  arrEq(f([10.0], [{ v: 9.8, pri: 1 }, { v: 10.2, pri: 2 }], 2), [10.2], '等距时高pri优先');
  arrEq(f([10.1, 10.2], [{ v: 10.15, pri: 2 }], 2), [10.15], '两级吸同位去重');
  arrEq(f([10.1], [{ v: 10.23456, pri: 2 }], 2), [10.235], '吸附结果3位小数');
}

// ================= tiers 做T分档 =================
console.log('— tiers —');
{
  const c = makeCtx([2026, 8, 10, 14, 0]), T = vm.runInContext('tiers', c);
  const t = (p, base, lv, atrOv, code, name, mags) => T(p, base, 40, lv, code || 'sh600105', name || '永鼎', 40, mags !== undefined ? mags : [], atrOv);
  let r = t(40, 2, 0, 0.8);   // ATR%2% <3%
  arrEq(r.sells, [40.6], '普通低波1档卖 40+0.3×2'); arrEq(r.buys, [39], '普通低波1档买 40-0.5×2');
  r = t(40, 2, 0, 1.6);       // ATR%4%
  arrEq(r.sells, [40.6, 41.2], 'ATR4%出2档卖'); arrEq(r.buys, [39, 38.3], 'ATR4%出2档买');
  r = t(40, 2, 0, 2.6);       // ATR%6.5% 高波
  arrEq(r.sells, [40.6, 41.2, 41.9], '高波6.5%满3档卖'); arrEq(r.buys, [39, 38.3, 37.6], '高波6.5%满3档买');
  arrEq(t(40, 2, 0, 2.0).sells, [40.6, 41.2, 41.9], 'ATR%恰=5%进满档(1e-9容差T5②)');
  arrEq(t(40, 2, 0, 1.9999999).sells, [40.6, 41.2], 'ATR%=4.99999975%不进满档');
  r = t(40, 2, 2, 0.8);       // lv2 极端日
  arrEq(r.sells, [40.7, 41.4, 42], 'lv2卖侧[0.35,0.7,1.0]');
  arrEq(r.buys, [39, 38.2, 37.4], 'lv2买侧[0.5,0.9,1.3]比满档宽=有意保留(T5①)');
  arrEq(t(43.9, 2, 2, 0.8).sells, [44], '撞涨停全部clip到44并去重');
  arrEq(t(36.1, 2, 2, 0.8).buys, [36], '撞跌停全部clip到36并去重');
  r = t(40, 10, 0, 0.8, 'sh600105', '永鼎', [{ v: 44.5, pri: 2 }]); // tol=1.8, 43吸到44.5再re-clip
  arrEq(r.sells, [44], '吸附拉出涨停后re-clip回44(T1)');
  r = T(1, 0.02, 1, 0, 'sh515880', '通信ETF', 1, [], 0.005); // ETF tick=0.001
  ok(r.sells.every(v => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6), 'ETF档价tick=0.001对齐');
  r = t(40, 2, 0, 2.6);
  ok(r.sells.every(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6), '股票档价tick=0.01对齐');
  ok(r.sells.every((v, i, a) => !i || v > a[i - 1]), '卖侧严格升序');
  ok(r.buys.every((v, i, a) => !i || v < a[i - 1]), '买侧严格降序');
  arrEq(t(40, 2, 0, null).sells, [40.6], 'atrOv缺失回退1档');
  ok(T(40, 2, 40, 0, 'sh600105', '永鼎', 40, [], 0.8).sells.every(v => v <= 44 + EPS), '卖档永不超过涨停');
}

// ================= narrowBase 禁止盘中内缩 =================
console.log('— narrowBase —');
{
  const c = makeCtx([2026, 8, 10, 14, 0]);
  c.ATR = { sh600105: { atr: 2 } };
  const f = vm.runInContext('narrowBase', c);
  let r = f('sh600105', 2, 1.0);
  eq(r.narrow, false, '振幅1.0<0.8×ATR不窄'); eq(r.base, 2, '不窄base原样');
  r = f('sh600105', 2, 1.8);
  eq(r.narrow, false, '振幅达到80%ATR仍禁止窄档'); eq(r.base, 2, '盘中振幅未超过base时保持原宽度');
  r = f('sh600105', 2, 2.4);
  eq(r.base, 2.4, '盘中振幅超过base只向外扩大');
  c._planNext = true;
  r = f('sh600105', 2, 1.8);
  eq(r.narrow, false, '明日计划窄档重置'); eq(r.base, 1.8, '重置回ampBase=ATR×FLOOR=1.8(FLOOR=0.9)');
}

// ================= todayPnlOf 今日盈亏(现金流恒等式) =================
console.log('— todayPnlOf —');
{
  const c = makeCtx([2026, 8, 10, 14, 0]); // 2026-09-10
  const f = vm.runInContext('todayPnlOf', c);
  c.TLOG = [];
  eq(f('sh600105', 1000, 41.48, 40), 1480, '无交易纯浮动 (41.48-40)×1000');
  c.TLOG = [{ code: 'sh600105', d: '2026-09-10', sell: 42, qty: 100, fee: 5 }, { code: 'sh600105', d: '2026-09-10', buy: 41, bq: 100, fee: 5 }];
  eq(f('sh600105', 1000, 41.48, 40), 1570, '配对做T=浮动1480+净现金流90(4200-4100-10费)');
  c.TLOG = [{ code: 'sh600105', d: '2026-09-10', sell: 42, qty: 100, fee: 5 }];
  eq(f('sh600105', 1000, 41.48, 40), 1675, '净减仓=41480+4195-40×1100(手算:浮动1480+实现200-费5)');
  c.TLOG = [{ code: 'sh600105', d: '2026-09-10', buy: 41, bq: 100, fee: 5 }];
  eq(f('sh600105', 1000, 41.48, 40), 1375, '净加仓=41480-4105-40×900(手算:老900股1332+新100股48-费5)');
  c.TLOG = [{ code: 'sh600105', d: '2026-09-10', sell: 42, qty: 100, fee: 5, acct: 'A' }, { code: 'sh600105', d: '2026-09-10', buy: 41, bq: 100, fee: 5, acct: 'A' },
            { code: 'sh600105', d: '2026-09-10', sell: 50, qty: 100, fee: 5, acct: 'B' }];
  eq(f('sh600105', 1000, 41.48, 40, 'A'), 1570, '多账户隔离:B账户50元卖出不混入A(v5.18)');
  c.TLOG = [{ code: 'sh600105', d: '2026-09-10', sell: 42, qty: 100, fee: 5 }]; // 无acct字段=旧格式
  eq(f('sh600105', 1000, 41.48, 40), 1675, '旧格式无acct字段默认账户照常计');
  eq(f('sh600105', 1000, null, 40), null, '现价缺失返回null');
}

// ================= settledRows 未完成日K剔除 =================
console.log('— settledRows —');
{
  const mk = (h, mi) => makeCtx([2026, 8, 10, h, mi]);
  const rows = [['2026-09-09', 1, 2, 3, 4], ['2026-09-10', 1, 2, 3, 4]];
  eq(vm.runInContext('settledRows', mk(14, 0))(rows).length, 1, '盘中14:00剔除当日未完成日K');
  eq(vm.runInContext('settledRows', mk(9, 30))(rows).length, 1, '09:30(t=570≤900)剔除');
  eq(vm.runInContext('settledRows', mk(15, 30))(rows).length, 2, '15:30收盘后保留当日日K');
  const old = [['2026-09-09', 1, 2, 3, 4]];
  eq(vm.runInContext('settledRows', mk(14, 0))(old).length, 1, '末行非今日不误剔');
}

// ================= poolFreshOK 终榜新鲜度闸 =================
console.log('— poolFreshOK —');
{
  const c1 = makeCtx([2026, 8, 10, 14, 0]); // 周四
  const f1 = vm.runInContext('poolFreshOK', c1);
  eq(f1('2026-09-10'), true, '当日新鲜');
  eq(f1('20260910'), true, 'yyyymmdd格式也认');
  eq(f1('2026-09-09'), false, '隔日不新鲜');
  eq(f1(''), false, '空不新鲜'); eq(f1(null), false, 'null不新鲜');
  const c2 = makeCtx([2026, 8, 13, 14, 0]); // 周日(lastTradeDay周末回退到周五)
  eq(vm.runInContext('poolFreshOK', c2)('2026-09-11'), true, '周日认上周五(周末回退)');
  const c3 = makeCtx([2026, 8, 14, 14, 0]); // 周一(交易日=当天,上周五不算新鲜)
  eq(vm.runInContext('poolFreshOK', c3)('2026-09-14'), true, '周一认当天');
  eq(vm.runInContext('poolFreshOK', c3)('2026-09-11'), false, '周一不认上周五');
}

// ================= tiers 通用档与live ratchet =================
console.log('— tiers/liveTiers —');
{
  const c = makeCtx([2026, 8, 10, 18, 30]); // 盘后→planNext, ref=今收
  const f = vm.runInContext('tiers', c);
  const r = f(43.46, 3.19, 43.46, 0, 'sh600176', '中国巨石', 43.46); // refFix传入→不走liveMags,纯数学
  eq(r.buys.length, 1, '低波分支单买档');
  eq(r.buys[0], 41.87, '巨石回退通用B1=43.46-0.5×3.19≈41.87');
  eq(r.sells[0], 44.42, '卖侧不动 S1=43.46+0.3×3.19≈44.42');
  eq(vm.runInContext('tierProfileLabel',c)('sh601995'),'通用档·未标定','无有效分票参数明示fallback');
  c._planNext=false;
  const live=vm.runInContext('liveTiers',c);
  const a=live(40,2,40,2,'sh600105','永鼎',undefined,[],2.4);
  const b=live(40,1,40,2,'sh600105','永鼎',undefined,[],2.4);
  arrEq(b.sells,a.sells,'同锚S1/S2/S3不向内'); arrEq(b.buys,a.buys,'同锚B1/B2/B3不向内');
  const c2=live(41,1,40,2,'sh600105','永鼎',undefined,[],2.4);
  eq(c.DANCH.sh600105.tierAnchorPrice,41,'合法换锚重绑新锚');
  arrEq(c2.sells,f(41,1,40,2,'sh600105','永鼎',undefined,[],2.4).sells,'换锚后卖梯按纯计算重新初始化');
}

console.log('— poolGate fixture —');
{
  const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/pool_gate_20260910.json'),'utf8'));
  eq(vm.runInContext('poolGate',makeCtx([2026,8,7,14,0]))(fx.huanrui).status,'派发风险','欢瑞跨位置+量能族排除');
  eq(vm.runInContext('poolGate',makeCtx([2026,8,10,14,0]))(fx.tianyu).status,'数据过期','天娱旧榜淘汰');
  eq(vm.runInContext('poolGate',makeCtx([2026,8,4,14,0]))(fx.yongding).ok,true,'永鼎单一资金负不判跑路');
  eq(vm.runInContext('poolGate',makeCtx([2026,8,10,14,0]))(fx.strong).ok,true,'正常强势正例保留');
  const gate=vm.runInContext('poolGate',makeCtx([2026,8,10,14,0]));
  eq(gate({...fx.strong,d:'2026-09-09'}).status,'数据过期','单票日K旧日期淘汰');
  eq(gate({...fx.strong,d0Date:'2026-09-09'}).status,'数据过期','单票资金旧日期淘汰');
  eq(gate({...fx.strong,d0:undefined,f10:undefined}).status,'证据不足','资金字段缺失降级');
  eq(gate({...fx.strong,fundStatus:'接口断线',fundSourceValid:false}).status,'证据不足','资金断线降级');
  eq(gate({...fx.strong,d0:-1,outStreak:1}).status,'数据冲突','单一资金负值只标数据冲突');
  const intent=vm.runInContext('poolIntentEvidence',makeCtx([2026,8,10,14,0]));
  eq(intent({...fx.strong,d0:2e7,dc5:35,vr:1.6,closeOffHigh:0.02}).status,'证据一致','主力证据多字段一致');
  eq(intent({...fx.strong,d0:-2e7,dc5:-15,vr:0.8,closeOffHigh:0.11}).status,'派发风险','主力证据多字段转弱');
  ok(/DDX按幅图序列/.test(intent({...fx.strong,d0:2e7,dc5:35,vr:1.6,closeOffHigh:0.02}).text), 'DDX沿用幅图序列');
  ok(/筹码按幅图序列/.test(intent({...fx.strong,d0:2e7,dc5:35,vr:1.6,closeOffHigh:0.02}).text), '筹码沿用幅图序列');
  const auto=vm.runInContext('poolAutoObserveEligible',makeCtx([2026,8,10,14,0]));
  eq(auto({days:2,inPx:100,lastPx:105},fx.strong),true,'在池两天且涨幅达到5%自动晋升');
  eq(auto({days:2,inPx:100,lastPx:104.9},fx.strong),false,'涨幅不足5%不自动晋升');
  eq(auto({days:2,inPx:100,lastPx:105,picked:true},fx.strong),false,'已晋升票不重复自动晋升');
  eq(auto({days:2,inPx:100,lastPx:105},{...fx.strong,d:'2026-09-09'}),false,'自动晋升复用单票日K新鲜度门');
  const cacheDecision=vm.runInContext('poolCacheDecision',makeCtx([2026,8,10,14,0]));
  eq(vm.runInContext('poolDateText',makeCtx([2026,8,10,14,0]))('20260910'),'2026-09-10','八位日期统一为ISO日期');
  eq(cacheDecision('2026-09-09','2026-09-09'),'drop','旧缓存直接丢弃');
  eq(cacheDecision('2026-09-10','2026-09-10'),'show','已核验当日缓存可展示');
  eq(cacheDecision('20260910','2026-09-10'),'show','八位当日缓存核验可展示');
  eq(cacheDecision('2026-09-10',''),'verify','未核验当日缓存必须先核验');
}

// ================= meta: 盯住全局口径常量 =================
console.log('— meta —');
{
  ok(!/_kdf\s*=|bounce_all.*sd/.test(SRC), '错误bounce_all→_kdf→sd映射消失');
  ok(/function liveTiers/.test(SRC)&&/tierAnchorType/.test(SRC)&&/tierSells/.test(SRC), 'liveTiers绑定锚并持久化六档');
  ok(/通用档·未标定/.test(SRC), 'fallback文案已落地');
  ok(!/_manual|manualOverride/.test(SRC), '主推区不再引用未定义手动字段');
  const m = SRC.match(/ATR_FLOOR=([\d.]+)/);
  eq(m && +m[1], 0.9, 'ATR_FLOOR=0.9(v5.198)');
  const g=SRC.match(/GRID_FIX=\{([^}]*)\}/);
  ok(g && /sh600176:1(?!\d)/.test(g[1]), 'GRID_FIX sh600176=1元格');
  ok(SRC.indexOf('GRID_FIX[code]||(anchor>=10?0.5')>=0 && SRC.indexOf('GRID_FIX[code]||(prev>=10?0.5')>=0, 'liveMags/btMags 均走 GRID_FIX(回测同口径铁律)');
  ok(FNS.every(n => bundle.indexOf('function ' + n) >= 0), '17个目标函数全部抽取成功');
  const addWatchSrc=extractFn('poolAddWatch'), addAllSrc=extractFn('poolAddAll'), scanSrc=extractFn('poolScan');
  ok(/poolEligible\(x\)/.test(SRC)&&/poolEligible\(poolFind\(p2\.code\)\)/.test(SRC), '今日推荐与留存主推均复用统一资格门');
  ok(/poolGate\(gx\)/.test(addWatchSrc)&&/poolFreshOK\(POOL_CACHE\.d0\)/.test(addAllSrc)&&/poolEligible\(x\)/.test(addAllSrc), '单张观察与全入观察均重新过资格门');
  ok(/rawL\s*=\s*POOL_CACHE\.L\s*\|\|\s*\{\}/.test(SRC)&&/filter\(x=>poolEligible\(x\)\)/.test(SRC), '池卡分层展示逐票复核资格门');
  ok(/POOL_CACHE\s*=\s*\{[^\n]*L:\s*L/.test(scanSrc)&&/current\s*=\s*poolFind\(c\)/.test(scanSrc)&&/poolAutoObserveEligible\(hh2,current\)/.test(scanSrc), '涨5%自动晋升只读取本轮L与当前缓存');
  ok(/if\(_px && poolFreshOK\(_px\.d0\)\)/.test(SRC)&&! /if\(_px && poolCacheOK\(_px\.d0\|\|_px\.date\)\)/.test(SRC), '旧缓存不能绕过单票今日新鲜度门');
  ok(/function poolVerifyCache/.test(SRC)&&/poolHideCache\('池数据日期核验失败，未展示旧缓存'\)/.test(SRC)&&/poolVerifyCache\(cached\)\.then/.test(SRC), '缓存日期核验失败清除旧榜且不展示');
  ok(/if\(fin\) return/.test(SRC), '资金超时后迟到回调不能覆盖失败状态');
  ok(/tr0:null,tr0Reliable:false/.test(SRC)&&/换手数据缺失/.test(SRC), '未取得可靠换手时保持客观缺失降级');
  ok(/今日无合格票/.test(SRC)&&/数据过期 '\+rs\.stale/.test(SRC), '空榜显示今日无合格票和三类统计');
  ok(/资金源 /.test(SRC)&&/数据日 /.test(SRC), '龙头池卡片直接显示资金来源和数据时间');
}

console.log('\n=========================');
console.log('PASS=' + PASS + ' FAIL=' + FAIL);
if (FAIL) { console.log('失败清单:'); ERRS.forEach(e => console.log('  - ' + e)); process.exit(1); }
console.log('ALL GREEN · ERRCOUNT=0');
