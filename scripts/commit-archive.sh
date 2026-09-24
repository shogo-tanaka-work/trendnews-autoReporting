#!/usr/bin/env bash
# 昇格台帳（archive/）をリポジトリへ記録して push する。
# systemd の ExecStartPost から呼ばれる（neta_weekly のみ）。
#
# コードは Mac → GitHub → ミニ PC、台帳はミニ PC → GitHub → Mac の一方向。
# 触るパスが src/ と archive/ に分かれるので衝突しない。
set -euo pipefail

REPO_DIR="${TECH_RADAR_REPO_DIR:-/opt/tech-radar}"
cd "$REPO_DIR"

if [[ -z "$(git status --porcelain archive)" ]]; then
  echo "archive に差分がないため記録をスキップします"
  exit 0
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

git add archive

# コミット主体はここで明示する。ミニ PC 側の git 設定に依存させない
git -c user.name="tech-radar (miniPC)" \
    -c user.email="s-tanaka@shogoworks.com" \
    commit -m "chore: $(date +%F) のネタ週報を記録"

# Mac 側がコードを push している場合に非 fast-forward で弾かれるのを避ける。
# 台帳とコードは触るパスが違うので、rebase で衝突することはない
git pull --rebase origin "$BRANCH"
git push origin "$BRANCH"
