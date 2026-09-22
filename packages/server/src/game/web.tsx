import { html } from "hono/html";

// クライアント(hono/jsx/dom)を載せるだけの殻。進行の表示は全部クライアント側。
// 色は :root のトークンで持つ。ダークモードをセレクタの上書きで書くと、
// 後続のルールに負けて効かなくなる(実際に card だけ白いまま残った)。
export const GamePage = () =>
  html`<!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>ワードニンジャ</title>
        <style>
          :root {
            color-scheme: light dark;
            --bg: #f4f5f7;
            --fg: #14171c;
            --card: #ffffff;
            --field: #ffffff;
            --border: #d3d8df;
            --muted: #5b626d;
            --accent: #1d4ed8;
            --accent-fg: #ffffff;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --bg: #14161a;
              --fg: #edeff2;
              --card: #21252c;
              --field: #171a1f;
              --border: #3d434e;
              --muted: #a8b0bc;
              --accent: #5b8cff;
              --accent-fg: #0d1117;
            }
          }
          * { box-sizing: border-box; }
          body { font-family: system-ui, sans-serif; margin: 0; line-height: 1.6;
                 background: var(--bg); color: var(--fg); }
          .wrap { max-width: 640px; margin: 0 auto; padding: 20px 16px 64px; }
          h1 { font-size: 18px; margin: 0; }
          h2 { font-size: 13px; margin: 0 0 10px; color: var(--muted);
               font-weight: 700; letter-spacing: .04em; }
          .card { background: var(--card); border: 1px solid var(--border);
                  border-radius: 12px; padding: 14px 16px; margin: 12px 0; }
          .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
          input, select { padding: 9px 11px; border: 1px solid var(--border);
                          border-radius: 8px; font-size: 15px; font-family: inherit;
                          background: var(--field); color: var(--fg); }
          input::placeholder { color: var(--muted); opacity: 1; }
          input[type="text"] { flex: 1; min-width: 140px; }
          input[type="number"] { width: 84px; }
          button { padding: 9px 15px; border: 1px solid var(--border); border-radius: 8px;
                   background: var(--card); color: var(--fg); font-size: 15px;
                   font-family: inherit; cursor: pointer; }
          button:hover:not(:disabled) { border-color: var(--accent); }
          button.primary { background: var(--accent); border-color: var(--accent);
                           color: var(--accent-fg); font-weight: 600; }
          button:disabled { opacity: .4; cursor: default; }
          .word { font-size: 36px; font-weight: 700; text-align: center;
                  padding: 20px 0; color: var(--fg); letter-spacing: .04em; }
          .muted { color: var(--muted); font-size: 13px; }
          .chip { display: inline-block; border: 1px solid var(--border);
                  border-radius: 999px; padding: 2px 11px; margin: 2px 4px 2px 0;
                  font-size: 13px; color: var(--fg); }
          .chip.host { border-color: var(--accent); color: var(--accent); font-weight: 600; }
          .q { border-top: 1px solid var(--border); padding: 9px 0; }
          .q:first-child { border-top: 0; }
          .q .text { color: var(--fg); }
          code { background: var(--field); border: 1px solid var(--border);
                 padding: 1px 7px; border-radius: 5px; font-size: 13px; }
          .spacer { flex: 1; }
        </style>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="/game/client.js"></script>
      </body>
    </html>`;
