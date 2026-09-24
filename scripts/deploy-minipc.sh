#!/usr/bin/env bash
# このリポジトリをそのまま systemd から動かせる状態にする。
#
#   sudo bash scripts/deploy-minipc.sh
#
# 何度実行してもよい。コードも秘密値もこのディレクトリのままで、別の場所へは複製しない。
# systemd 側へ渡すのは unit ファイルだけ。
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR=/etc/systemd/system
API_UNIT="$SRC/systemd/tech-radar-api.service"

# unit 本体。generated/ は drop-in だけなので、これらが無いと Unit not found になる。
UNIT_FILES=(
  tech-radar-api.service
  tech-radar-connpass.service
  tech-radar-collect@.service
  tech-radar-collect@.timer
  tech-radar-connpass.timer
  tech-radar-keywords.service
  tech-radar-keywords.timer
)

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\033[31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

# --- 1. 事前確認 ------------------------------------------------------------
# unit が指す値と実体がずれていると status=203/EXEC などで起動だけが失敗するため、
# systemctl を触る前にすべて突き合わせる。
step '事前確認'

[[ $EUID -eq 0 ]] || fail 'root で実行すること: sudo bash scripts/deploy-minipc.sh'

RUN_USER="${SUDO_USER:-}"
[[ -n "$RUN_USER" && "$RUN_USER" != root ]] ||
  fail 'sudo 経由で実行すること（ビルドは呼び出したユーザーで行う）'

unit_user="$(sed -n 's/^User=//p' "$API_UNIT")"
[[ "$unit_user" == "$RUN_USER" ]] ||
  fail "unit の User=$unit_user と実行者 $RUN_USER が違う。systemd/*.service を直すこと"

unit_dir="$(sed -n 's/^WorkingDirectory=//p' "$API_UNIT")"
[[ "$unit_dir" == "$SRC" ]] ||
  fail "unit の WorkingDirectory=$unit_dir とこのリポジトリ $SRC が違う。systemd/*.service を直すこと"

NODE_BIN="$(sed -n 's/^ExecStart=\([^ ]*\) .*/\1/p' "$API_UNIT")"
[[ -x "$NODE_BIN" ]] ||
  fail "unit の ExecStart が指す node が無い: $NODE_BIN
       今の node は $(sudo -u "$RUN_USER" -H bash -lc 'command -v node' 2>/dev/null || echo '不明')。
       node を入れ替えたなら systemd/*.service の ExecStart を直すこと"

node_version="$("$NODE_BIN" -p 'process.versions.node')"
[[ "${node_version%%.*}" -ge 20 ]] || fail "Node.js 20 以上が要る（$NODE_BIN は v$node_version）"

echo "  repo : $SRC"
echo "  user : $RUN_USER"
echo "  node : $NODE_BIN (v$node_version)"

run_as_user() {
  sudo -u "$RUN_USER" -H env PATH="$(dirname "$NODE_BIN"):/usr/local/bin:/usr/bin:/bin" \
    sh -c "cd '$SRC' && $*"
}

# --- 2. 書き込み先を用意する ------------------------------------------------
# ReadWritePaths= は存在しないパスを指定すると mount namespace の構築に失敗し、
# 起動が status=226/NAMESPACE になる。data/ は Git 管理外なので必ずここで作る。
step '書き込み先を用意する'

while read -r rw_path; do
  if [[ ! -e "$rw_path" ]]; then
    echo "  作成: $rw_path"
    install -d -o "$RUN_USER" -g "$RUN_USER" "$rw_path"
  fi
done < <(sed -n 's/^ReadWritePaths=//p' "$SRC"/systemd/*.service \
                 "$SRC"/systemd/tech-radar-collect@*.service.d/*.conf | sort -u)

# --- 3. 依存とビルド --------------------------------------------------------
step '依存とビルドを揃える'

if [[ ! -d "$SRC/node_modules" ]]; then
  run_as_user 'npm ci'
fi

# better-sqlite3 は native module。unit が使う node と ABI が違うと
# 実行時にだけ「compiled against a different Node.js version」で落ちる。
if ! run_as_user "$NODE_BIN -e \"require('better-sqlite3')\"" 2>/dev/null; then
  echo "  better-sqlite3 を v$node_version 向けに build し直す"
  run_as_user 'npm rebuild better-sqlite3'
  run_as_user "$NODE_BIN -e \"require('better-sqlite3')\"" ||
    fail 'better-sqlite3 を読み込めない。build-essential と python3 が要る'
fi

run_as_user 'npm run build'
[[ -f "$SRC/dist/api/server.js" ]] || fail "ビルド結果が無い: $SRC/dist/api/server.js"

# --- 4. 環境変数の検証 ------------------------------------------------------
# 秘密値ファイル名や必須項目をここへ書き写すと二重管理になるので、
# アプリ自身の検証（src/lib/env.ts の loadEnv）に判定させる。
step '環境変数を検証する'

env_err="$(mktemp)"
trap 'rm -f "$env_err"' EXIT

warn() { printf '\033[33m  %s\033[0m\n' "$1"; }

# API を起動してよいかどうか。駄目でも収集 timer の配置までは進める。
api_ok=1
api_addr=''

if api_addr="$(run_as_user \
  "$NODE_BIN -e \"import('./dist/lib/env.js').then(m => { const e = m.loadEnv(); console.log(e.API_HOST, e.API_PORT) })\"" \
  2>"$env_err")"; then
  echo "  OK（API の listen 先: ${api_addr/ /:}）"
else
  api_ok=0
  warn "$(sed -n 's/^Error: //p' "$env_err" | head -1)"
  warn 'API は起動せず enable のみ行う。設定後に systemctl start すること'
fi

# ポートが埋まっていると unit は enable できるのに起動だけ EADDRINUSE で失敗する。
# 既に自分が listen している場合は衝突ではないので除外する。
if [[ "$api_ok" -eq 1 ]] && ! systemctl is-active --quiet tech-radar-api.service; then
  api_port="${api_addr##* }"
  if [[ -n "$(ss -ltnH "sport = :$api_port" 2>/dev/null)" ]]; then
    api_ok=0
    warn "ポート $api_port は別のプロセスが listen 中。API は起動しない"
    warn "空きポートを API_PORT に設定するか、占有元を止めること（sudo ss -ltnp 'sport = :$api_port'）"
  fi
fi

# --- 5. unit を配置する -----------------------------------------------------
step 'unit を配置する'

run_as_user 'npm run gen:systemd' >/dev/null

for unit in "${UNIT_FILES[@]}"; do
  install -m 0644 "$SRC/systemd/$unit" "$UNIT_DIR/$unit"
done

# drop-in はディレクトリごと。generated/ がスケジュール、*.service.d が個別の追加設定。
cp -r "$SRC/systemd/generated/." "$UNIT_DIR/"
for dropin in "$SRC"/systemd/tech-radar-collect@*.service.d; do
  cp -r "$dropin" "$UNIT_DIR/"
done
find "$UNIT_DIR" -name 'tech-radar-collect@*.d' -type d -exec chmod 0755 {} +
find "$UNIT_DIR" -path '*/tech-radar-collect@*.d/*.conf' -exec chmod 0644 {} +

systemctl daemon-reload

# --- 6. 有効化 --------------------------------------------------------------
step 'timer と API を有効化する'

categories=()
for dir in "$SRC"/systemd/generated/tech-radar-collect@*.timer.d; do
  name="$(basename "$dir")"
  name="${name#tech-radar-collect@}"
  categories+=("${name%.timer.d}")
done
[[ ${#categories[@]} -gt 0 ]] || fail 'gen:systemd の生成結果が無い'

systemctl enable --now tech-radar-connpass.timer tech-radar-keywords.timer
for category in "${categories[@]}"; do
  systemctl enable --now "tech-radar-collect@$category.timer"
done

# 設定から消したカテゴリの timer は自動では止めない（取り違えて止めると通知が途絶えるため）。
# 残っていると存在しないカテゴリとして毎回失敗するので、見つけたら手順を出す。
for dir in "$UNIT_DIR"/tech-radar-collect@*.timer.d; do
  [[ -d "$dir" ]] || continue
  name="$(basename "$dir")"
  name="${name#tech-radar-collect@}"
  name="${name%.timer.d}"
  if [[ ! " ${categories[*]} " == *" $name "* ]]; then
    warn "設定に無いカテゴリの timer が残っている: $name（README「カテゴリを廃止したとき」で止めること）"
  fi
done

systemctl enable tech-radar-api.service
if [[ "$api_ok" -eq 1 ]]; then
  # 既に動いている場合に新しいビルドへ入れ替えるため、start ではなく restart を使う。
  systemctl restart tech-radar-api.service
else
  # 起動できないと分かっているので、Restart=on-failure の再起動ループを止めておく。
  systemctl stop tech-radar-api.service
  systemctl reset-failed tech-radar-api.service || true
fi

# --- 7. 結果 ----------------------------------------------------------------
step '配置結果'

systemctl list-timers --all 'tech-radar-*' --no-pager || true

cat <<EOS

次の確認:
  sudo systemctl start tech-radar-collect@engineer_news
  journalctl -u tech-radar-collect@engineer_news --since '5 min ago' --no-pager
EOS
if [[ "$api_ok" -eq 1 ]]; then
  echo "  curl http://${api_addr/ /:}/health"
fi
