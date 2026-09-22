import { html } from "hono/html";

// クライアント(hono/jsx/dom)を載せるだけの殻。進行の表示は全部クライアント側。
export const GamePage = () =>
  html`<!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>ワードニンジャ</title>
        <style>
          :root { color-scheme: light dark; }
          * { box-sizing: border-box; }
          body { font-family: system-ui, sans-serif; margin: 0; line-height: 1.6;
                 background: #f6f7f9; color: #1a1a1a; }
          @media (prefers-color-scheme: dark) {
            body { background: #16181d; color: #e8e8e8; }
            .card, input, select, button { background: #21242b; color: #e8e8e8; border-color: #3a3f4b; }
          }
          .wrap { max-width: 640px; margin: 0 auto; padding: 20px 16px 64px; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          h2 { font-size: 14px; margin: 0 0 8px; color: #8a8f98; font-weight: 600; }
          .card { background: #fff; border: 1px solid #e3e6ea; border-radius: 10px;
                  padding: 14px 16px; margin: 12px 0; }
          .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
          input, select { padding: 8px 10px; border: 1px solid #d6dae0; border-radius: 8px;
                          font-size: 15px; font-family: inherit; }
          input[type="text"] { flex: 1; min-width: 140px; }
          button { padding: 8px 14px; border: 1px solid #d6dae0; border-radius: 8px;
                   background: #fff; font-size: 15px; font-family: inherit; cursor: pointer; }
          button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
          button:disabled { opacity: .45; cursor: default; }
          .word { font-size: 34px; font-weight: 700; text-align: center; padding: 18px 0; }
          .muted { color: #8a8f98; font-size: 13px; }
          .chip { display: inline-block; border: 1px solid #d6dae0; border-radius: 999px;
                  padding: 1px 10px; margin: 2px 4px 2px 0; font-size: 13px; }
          .q { border-top: 1px solid #e3e6ea; padding: 8px 0; }
          .q:first-child { border-top: 0; }
          code { background: #eef1f5; padding: 1px 6px; border-radius: 4px; }
          @media (prefers-color-scheme: dark) { code { background: #2a2e37; } }
        </style>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="/game/client.js"></script>
      </body>
    </html>`;
