#!/bin/bash
# install-hooks.sh — 把 claude-brain v2.0 的 hooks 自动加到 ~/.claude/settings.json
#
# 安全设计：
# - 先备份 settings.json
# - 用 Python 修改（保留其他 hooks 配置）
# - 去重（已存在则跳过）
# - 加 hook 前先 chmod +x 所有脚本

set -e

SETTINGS=~/.claude/settings.json
SCRIPTS_DIR=~/.claude-brain/scripts

if [ ! -f "$SETTINGS" ]; then
  echo "❌ $SETTINGS 不存在"
  exit 1
fi

# 备份
BACKUP="${SETTINGS}.bak-$(date +%Y%m%d-%H%M%S)"
cp "$SETTINGS" "$BACKUP"
echo "✅ 备份 → $BACKUP"

# 确保脚本可执行
chmod +x "$SCRIPTS_DIR/inject-context.js" 2>/dev/null || true
chmod +x "$SCRIPTS_DIR/capture-lesson.js" 2>/dev/null || true
chmod +x "$SCRIPTS_DIR/update-state.js" 2>/dev/null || true

python3 << 'PYEOF'
import json, os

home = os.path.expanduser("~")
settings_path = os.path.join(home, ".claude/settings.json")
scripts_dir = os.path.join(home, ".claude-brain/scripts")

with open(settings_path) as f:
    s = json.load(f)

hooks = s.setdefault("hooks", {})

# === UserPromptSubmit: inject-context ===
ups = hooks.setdefault("UserPromptSubmit", [])
inject_cmd = f"node {scripts_dir}/inject-context.js"

already_inject = any(
    'claude-brain/scripts/inject-context' in json.dumps(g)
    for g in ups
)
if not already_inject:
    ups.append({
        "matcher": "",
        "hooks": [{
            "type": "command",
            "command": inject_cmd,
            "timeout": 5
        }]
    })
    print("✅ UserPromptSubmit · inject-context.js — added")
else:
    print("⏭️  UserPromptSubmit · inject-context.js — already exists, skipped")

# === Stop: capture-lesson + update-state ===
st = hooks.setdefault("Stop", [])
capture_cmd = f"node {scripts_dir}/capture-lesson.js; node {scripts_dir}/update-state.js"

already_capture = any(
    'claude-brain/scripts/capture-lesson' in json.dumps(g)
    for g in st
)
if not already_capture:
    st.append({
        "matcher": "",
        "hooks": [{
            "type": "command",
            "command": capture_cmd,
            "timeout": 10
        }]
    })
    print("✅ Stop · capture-lesson.js + update-state.js — added")
else:
    print("⏭️  Stop · capture-lesson.js — already exists, skipped")

with open(settings_path, 'w') as f:
    json.dump(s, f, indent=2, ensure_ascii=False)

print()
print("✅ settings.json 已更新")
print()
print("生效方式：下次启动 Claude Code 会话即生效。")
print("当前会话不会立刻生效（hooks 只在会话启动时被加载）。")
PYEOF

echo ""
echo "🎉 claude-brain v2.0 hooks 安装完成"
echo ""
echo "测试方法："
echo "  1. 启动新的 Claude Code 会话"
echo "  2. 发任意消息"
echo "  3. 看 ~/.claude-brain/lessons/ 是否有 draft 产生（结束会话时）"
echo "  4. cat ~/.claude-brain/STATE.md  → 顶部时间戳应该被更新"
