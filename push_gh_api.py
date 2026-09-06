#!/usr/bin/env python3
# push_gh_api.py — 本机 git 443 被墙时的推送通道: 用 gh CLI(已登录fululi)走 GitHub Contents API
# 用法: python3 push_gh_api.py "提交说明" [文件1 文件2 ...]   (默认推 index.html + pe_band.js)
import base64, json, subprocess, sys, os

REPO = "fululi/hq-mobile"
FILES = sys.argv[2:] if len(sys.argv) > 2 else ["index.html", "pe_band.js"]
MSG = sys.argv[1] if len(sys.argv) > 1 else "update"
os.chdir(os.path.dirname(os.path.abspath(__file__)))

for path in FILES:
    p = subprocess.run(["gh", "api", "repos/%s/contents/%s" % (REPO, path), "--jq", ".sha"],
                       capture_output=True, text=True)
    if p.returncode != 0:
        sha = None  # 远端无此文件 → 走新建(不传sha)
    else:
        sha = p.stdout.strip()
    content = base64.b64encode(open(path, "rb").read()).decode()
    body = {"message": MSG, "content": content, "branch": "main"}
    if sha: body["sha"] = sha
    p = subprocess.run(["gh", "api", "-X", "PUT", "repos/%s/contents/%s" % (REPO, path),
                        "--input", "-"], input=json.dumps(body), capture_output=True, text=True)
    if p.returncode != 0:
        print("推送失败", path, p.stderr[:300]); sys.exit(1)
    j = json.loads(p.stdout)
    print("OK", path, "→", j["commit"]["sha"][:8])
print("完成。GitHub Pages 约1-2分钟部署,手机端强刷(长按刷新/清缓存)看新版。")
