/**
 * 追いかけるキーワード（検索トレンドの定点観測）。ネタ週報の冒頭に動きを載せる。
 *
 * 「今何が伸びているか」を見て、SE 目線で書けるネタと、受託の出品文・事例タイトルに
 * 使える言葉を拾うのが目的。AI・クラウドの公式アップデートは別運用なので入れない。
 *
 * SerpApi の無料枠は月 250 検索。推移と関連クエリを1語ずつ取るので、N 語なら 2N 検索。
 * 週1回・17語で月 150 検索ほど。ネタ週報の急上昇ワード（日次で月 30）と合わせて枠内に収まる。
 * 語を増やすときはこの見積もりを見直す。語にカンマは使えない（SerpApi が複数語として分割する）。
 */

export type KeywordGroup = {
  label: string;
  keywords: string[];
};

export const KEYWORD_GROUPS: KeywordGroup[] = [
  {
    label: 'AI開発ツール',
    keywords: ['Claude Code', 'Codex', 'Cursor', 'AIエージェント', 'Agent Skills', 'ハーネスエンジニアリング'],
  },
  {
    // 発注者が使う言葉。伸びている関連語は出品文・事例タイトルの材料になる
    label: '発注者の悩み',
    keywords: ['業務自動化', '業務効率化 AI', 'Excel 自動化', 'GAS 自動化', 'AI 導入 中小企業'],
  },
  {
    label: '比較・選定',
    keywords: ['Claude Code 料金', 'Cursor Claude Code 比較'],
  },
  {
    label: '副業・受託の論点',
    keywords: ['AI副業', 'RAG', 'AIセキュリティ', 'プロンプトインジェクション'],
  },
];

export const WATCH_KEYWORDS: string[] = KEYWORD_GROUPS.flatMap((group) => group.keywords);

/** 前週比がこの割合（%）以上動いたものだけを「動いた」として通知に載せる */
export const NOTABLE_CHANGE_PCT = 20;

/** 1キーワードあたりに載せる急上昇の関連クエリ数 */
export const MAX_RISING_QUERIES = 3;

/**
 * 急上昇の関連クエリから除く語。大小文字と空白の違いは無視して完全一致で比べる。
 *
 * 複数の語に同時に出る無関係語（Google Trends 全体の急上昇）は自動で除くので、
 * ここに足すのは1語にだけ出て自動では落ちないものに限る。
 */
export const IGNORED_RISING_QUERIES: string[] = [
  'best time to visit maldives',
  '翻译',
  'ドル 円',
  'maple leaf rag',
  '京都 rag',
];
