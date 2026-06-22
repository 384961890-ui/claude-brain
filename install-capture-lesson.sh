#!/bin/bash
# install-capture-lesson.sh — 把 claude-brain v2 的 capture-lesson + update-state 挂回 Stop hook
#
# 背景：这俩 Stop hook 在 2026-05-31 之后被某次 settings.json 重写覆盖丢失。
#   证据：bak-20260531 的 Stop 第 [1] 条还是 `capture-lesson.js; update-state.js`，
#   但 bak-thinkloop-20260608 已无，且整组 Stop 被重排/增减
#   —— 集成工具(vibe-island/clawd/agentbar)整体重写 settings.json 的特征，
#      非手动删除、非故意移除、非从未安装（6 个旧备份都含这两脚本）。
#
# 设计（照 v3 install-think-loop.sh 的安全模式 + 校验失败自动回滚）：
# - 先备份 settings.json
# - 用 Python 改（保留其他所有 hooks）
# - 幂等去重（已挂载则跳过）
# - 恢复历史原形态：单 entry 合成串 `capture-lesson.js; update-state.js`, timeout 10
#   （与 install-hooks.sh 的幂等检测口径一致，未来重跑 install-hooks.sh 会自动跳过）
# - 改完校验 JSON 合法；不合法立即从备份回滚

set -e

SETTINGS="$HOME/.claude/settings.json"
SCRIPTS_DIR="$HOME/.claude-brain/scripts"
CAPTURE="$SCRIPTS_DIR/capture-lesson.js"
UPDATE="$SCRIPTS_DIR/update-state.js"

if [ ! -f "$SETTINGS" ]; then echo "❌ $SETTINGS 不存在"; exit 1; fi
if [ ! -f "$CAPTURE" ]; then echo "❌ $CAPTURE 不存在"; exit 1; fi
if [ ! -f "$UPDATE" ]; then echo "❌ $UPDATE 不存在"; exit 1; fi

BACKUP="${SETTINGS}.bak-capturelesson-$(date +%Y%m%d-%H%M%S)"
cp "$SETTINGS" "$BACKUP"
echo "✅ 备份 → $BACKUP"

chmod +x "$CAPTURE" "$UPDATE" 2>/dev/null || true

python3 << 'PYEOF'
import json, os
sp = os.path.expanduser('~/.claude/settings.json')
scripts_dir = os.path.expanduser('~/.claude-brain/scripts')
s = json.load(open(sp))
stop = s.setdefault('hooks', {}).setdefault('Stop', [])
cmd = f"node {scripts_dir}/capture-lesson.js; node {scripts_dir}/update-state.js"

if any('claude-brain/scripts/capture-lesson' in json.dumps(g) for g in stop):
    print('⏭️  capture-lesson 已挂载，跳过（幂等）')
else:
    stop.append({'matcher': '', 'hooks': [{'type': 'command', 'command': cmd, 'timeout': 10}]})
    json.dump(s, open(sp, 'w'), indent=2, ensure_ascii=False)
    print('✅ capture-lesson.js + update-state.js 已挂到 Stop hook')
PYEOF

# 校验 JSON 合法；失败则自动回滚（if 条件位不触发 set -e）
if python3 -c "import json,os; json.load(open(os.path.expanduser('~/.claude/settings.json')))" 2>/dev/null; then
  echo "✅ settings.json JSON 合法"
else
  echo "❌ JSON 校验失败！从备份回滚..."
  cp "$BACKUP" "$SETTINGS"
  echo "✅ 已从 $BACKUP 回滚，settings.json 未损坏"
  exit 1
fi

echo ""
echo "生效方式：下次启动 Claude Code 会话即生效（hook 在会话启动时加载）。"
