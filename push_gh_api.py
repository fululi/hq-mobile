#!/usr/bin/env python3
# push_gh_api.py — 本机 git 443 被墙时的推送通道: 用 gh CLI(已登录fululi)走 GitHub API
# 用法: python3 push_gh_api.py "提交说明" [文件1 文件2 ...]   (默认推 index.html + pe_band.js)
# v2 (0910 外审整改): ① Trees API 单 commit 原子推多文件,不再分次 commit 出"新页面+旧数据"中间态
#                     ② 取 sha/树失败一律中止,只有确认 404 才当新文件;网络/鉴权故障不再误导成新建
#                     ③ --legacy 回退旧的 Contents API 逐文件推送
import base64, json, subprocess, sys, os

REPO = "fululi/hq-mobile"
ARGS = [a for a in sys.argv[1:]]
LEGACY = "--legacy" in ARGS
ARGS = [a for a in ARGS if a != "--legacy"]
MSG = ARGS[0] if ARGS else "update"
FILES = ARGS[1:] if len(ARGS) > 1 else ["index.html", "pe_band.js"]
os.chdir(os.path.dirname(os.path.abspath(__file__)))

def gh(args, inp=None):
    p = subprocess.run(["gh", "api"] + args, input=inp, capture_output=True, text=True)
    return p

def gh_or_die(args, inp=None, what=""):
    p = gh(args, inp)
    if p.returncode != 0:
        print("失败:", what or args[0], p.stderr[:300]); sys.exit(1)
    return json.loads(p.stdout)

if LEGACY:  # 旧通道: 逐文件 Contents API(分次 commit, 仅排障用)
    for path in FILES:
        p = gh(["repos/%s/contents/%s" % (REPO, path), "--jq", ".sha"])
        if p.returncode != 0:
            if "404" in p.stderr or "Not Found" in p.stderr:
                sha = None
            else:
                print("取sha失败(网络/鉴权?),中止防误新建:", path, p.stderr[:200]); sys.exit(1)
        else:
            sha = p.stdout.strip()
        content = base64.b64encode(open(path, "rb").read()).decode()
        body = {"message": MSG, "content": content, "branch": "main"}
        if sha: body["sha"] = sha
        p = gh(["-X", "PUT", "repos/%s/contents/%s" % (REPO, path), "--input", "-"], json.dumps(body))
        if p.returncode != 0:
            print("推送失败", path, p.stderr[:300]); sys.exit(1)
        print("OK", path, "→", json.loads(p.stdout)["commit"]["sha"][:8])
    print("完成(legacy分次commit)。GitHub Pages 约1-2分钟部署。")
    sys.exit(0)

# 默认: Trees API 原子单 commit
head = gh_or_die(["repos/%s/git/ref/heads/main" % REPO], what="取main分支引用")
head_sha = head["object"]["sha"]
base = gh_or_die(["repos/%s/git/commits/%s" % (REPO, head_sha)], what="取HEAD commit")
tree_items = []
for path in FILES:
    if not os.path.exists(path):
        print("本地文件不存在:", path); sys.exit(1)
    # 先确认远端是否已有该文件(404才算新建; 其它错误中止)——防"网络故障被当成新文件"覆盖路径走歪
    p = gh(["repos/%s/contents/%s" % (REPO, path), "--jq", ".sha"])
    if p.returncode != 0 and not ("404" in p.stderr or "Not Found" in p.stderr):
        print("查远端文件状态失败(网络/鉴权?),中止:", path, p.stderr[:200]); sys.exit(1)
    tree_items.append({"path": path, "mode": "100644", "type": "blob",
                       "content": open(path, "r", encoding="utf-8").read()})
tree = gh_or_die(["-X", "POST", "repos/%s/git/trees" % REPO, "--input", "-"],
                 json.dumps({"base_tree": base["tree"]["sha"], "tree": tree_items}), "建tree")
commit = gh_or_die(["-X", "POST", "repos/%s/git/commits" % REPO, "--input", "-"],
                   json.dumps({"message": MSG, "tree": tree["sha"], "parents": [head_sha]}), "建commit")
gh_or_die(["-X", "PATCH", "repos/%s/git/refs/heads/main" % REPO, "--input", "-"],
          json.dumps({"sha": commit["sha"]}), "更新main引用")
print("OK 单commit原子推送 →", commit["sha"][:8], "· 文件:", ", ".join(FILES))
print("完成。GitHub Pages 约1-2分钟部署,手机端强刷(长按刷新/清缓存)看新版。")
