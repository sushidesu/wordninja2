import { html } from "hono/html";

// クライアント(hono/jsx/dom)を載せるだけの殻。進行の表示は全部クライアント側。
//
// 配色とフォントは packages/mobile の "Leaf Pop" テーマ(白キャンバスにグリーンを
// 主役、ティールを一点挿し)に合わせている。同じゲームなので見た目を揃える。
// mobile 側にダークモードが無いため、ここでも light 固定にする。色はトークンで
// 持ち、生の hex は :root だけに置く(mobile の theme.ts と同じ方針)。
export const GamePage = () =>
  html`<!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>ワードニンジャ</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
          href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=M+PLUS+1:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <style>
          :root {
            color-scheme: light;
            /* 面 */
            --canvas: #ffffff;
            --paper: #f9fafb;
            --paper-deep: #e5e7eb;
            --paper-strong: #d1d5db;
            /* 文字 */
            --ink: #102820;
            --ink-soft: #6b7280;
            --ink-mute: #9ca3af;
            /* アクセント */
            --hero: #0ebcaa;
            --hero-soft: #e6f6ea;
            --flame: #1e7a3e;
            --spark: #009e88;
            --danger: #ff5252;
            /* 語ごとの識別色 */
            --split-1: #11d480;
            --split-2: #fbbf24;
            --split-3: #fb7185;
            --split-4: #818cf8;

            --title: "Dela Gothic One", system-ui, sans-serif;
            --body: "M PLUS 1", system-ui, sans-serif;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: var(--body);
            font-weight: 400;
            line-height: 1.7;
            background: var(--paper);
            color: var(--ink);
            -webkit-font-smoothing: antialiased;
          }
          .wrap { max-width: 560px; margin: 0 auto; padding: 24px 16px 72px; }

          /* ---- 文字 ---- */
          .brand {
            font-family: var(--title);
            font-size: 22px;
            letter-spacing: .02em;
            margin: 0;
          }
          .display {
            font-family: var(--title);
            font-size: 40px;
            line-height: 1.25;
            text-align: center;
            letter-spacing: .04em;
            word-break: break-word;
          }
          h2 {
            font-family: var(--body);
            font-weight: 700;
            font-size: 12px;
            letter-spacing: .12em;
            color: var(--ink-soft);
            margin: 0 0 12px;
          }
          .muted { color: var(--ink-soft); font-size: 13px; }
          .lead { font-size: 15px; }

          /* ---- 面 ---- */
          .card {
            background: var(--canvas);
            border: 1px solid var(--paper-deep);
            border-radius: 16px;
            padding: 18px 18px;
            margin: 14px 0;
          }
          .card.accent { border-color: var(--hero); box-shadow: 0 0 0 3px var(--hero-soft); }
          .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
          .center { justify-content: center; }
          .spacer { flex: 1; }

          /* ---- 入力 ---- */
          input {
            font-family: var(--body);
            font-size: 16px;
            padding: 11px 13px;
            border: 1.5px solid var(--paper-strong);
            border-radius: 12px;
            background: var(--canvas);
            color: var(--ink);
          }
          input:focus { outline: none; border-color: var(--hero); }
          input::placeholder { color: var(--ink-mute); }
          input[type="text"] { flex: 1; min-width: 140px; }
          input[type="number"] { width: 88px; }
          input:disabled { background: var(--paper); color: var(--ink-mute); }

          /* ---- ボタン ---- */
          button {
            font-family: var(--body);
            font-weight: 700;
            font-size: 15px;
            padding: 11px 18px;
            border: 1.5px solid var(--paper-strong);
            border-radius: 12px;
            background: var(--canvas);
            color: var(--ink);
            cursor: pointer;
            transition: transform .05s ease, border-color .12s ease;
          }
          button:hover:not(:disabled) { border-color: var(--hero); }
          button:active:not(:disabled) { transform: translateY(1px); }
          button:disabled { opacity: .38; cursor: default; }
          button.primary {
            background: var(--hero);
            border-color: var(--hero);
            color: var(--canvas);
          }
          button.primary:hover:not(:disabled) { background: var(--spark); border-color: var(--spark); }
          button.spark { background: var(--spark); border-color: var(--spark); color: var(--canvas); }
          button.ghost { border-color: transparent; color: var(--ink-soft); padding: 8px 12px; }
          button.big { font-size: 17px; padding: 14px 26px; border-radius: 14px; }

          /* ---- 部品 ---- */
          .code {
            font-family: var(--title);
            font-size: 15px;
            letter-spacing: .22em;
            background: var(--hero-soft);
            color: var(--flame);
            padding: 3px 4px 3px 12px;
            border-radius: 8px;
          }
          .chip {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            border: 1.5px solid var(--paper-deep);
            border-radius: 999px;
            padding: 4px 13px;
            margin: 3px 5px 3px 0;
            font-size: 14px;
            font-weight: 500;
          }
          .chip.on { border-color: var(--hero); background: var(--hero-soft); color: var(--flame); }
          .chip.host { border-color: var(--spark); color: var(--spark); font-weight: 700; }
          .q { border-top: 1px solid var(--paper-deep); padding: 12px 0; }
          .q:first-of-type { border-top: 0; padding-top: 0; }
          .q .who { font-weight: 700; }
          .ans { color: var(--ink-soft); font-size: 13px; margin-top: 2px; }
          .team {
            border-left: 5px solid var(--paper-deep);
            border-radius: 6px;
            padding: 10px 0 10px 16px;
            margin: 14px 0;
          }
          .hidden-word { color: var(--ink-mute); letter-spacing: .3em; }
        </style>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="/game/client.js"></script>
      </body>
    </html>`;
