# Working Cat

VS Code のサイドバーに猫が住んでいます。あなたのコーディング活動や Claude Code セッションに反応してアニメーションします。

<video src="assets/demo.mp4" autoplay loop muted playsinline></video>

## 機能

- エディタの操作（タイプ・保存・エラー・アイドル）に合わせて猫がアニメーション
- Claude Code セッションが起動するたびに猫が横から走り込んで登場
- 複数セッションの同時表示に対応（セッションごとに1匹）
- 猫をクリックすると、そのClaudeセッションが動いているターミナルにフォーカス
- 各猫の下にセッションのタイトルを表示
- イベントに合わせて猫の鳴き声を再生（ON/OFF 切り替え・音量調整可）
- 背景シーンを選択可能

## 動作環境

- Linux または macOS
- [Claude Code](https://claude.ai/code)（Claudeセッション連携に必要）

## Claude Code 連携

初回起動時に `~/.claude/settings.json` へ自動でhookを登録し、Claude Code のセッション状態をリアルタイムに反映します。

hookを削除したい場合はコマンドパレットから実行してください：
```
Working Cat: Unregister Claude Code Hooks
```

## 猫の状態一覧

### エディタ猫

| 状態 | 意味 |
|------|------|
| idle | 何もしていない |
| typing... | ファイルを編集中 |
| saved! | ファイルを保存した |
| error! | エラーが検出された |
| zzz... | 5分以上アイドル |

### Claude Code 猫

| 状態 | 意味 |
|------|------|
| （走り込み） | 新しいセッション開始 — 画面端から走って登場 |
| （キョロキョロ） | 入力待ち |
| thinking... | Claude が応答を生成中 |
| done! | Claude が完了（クリックで消去） |
| waiting... | Claude がパーミッション待ち |

## 鳴き声

パネル右上に 🔊 ボタンが表示されます。初回は一度クリックしてください（ブラウザの自動再生制限のため）。

| タイミング | 音 |
|------|------|
| 入力待ち | 迷いにゃ × 1回 |
| done! | 元気にゃ × 1回 |
| パーミッション待ち | ゆっくりにゃ × 1回 |

## 設定

| 設定 | デフォルト | 説明 |
|------|------|------|
| `workingCat.background` | `bg2` | 背景シーン（`bg1`: 日本の家、`bg2`: 公園） |
| `workingCat.sound` | `true` | 鳴き声のON/OFF |
| `workingCat.volume` | `0.5` | 鳴き声の音量（0.0 〜 1.0） |

## 既知の問題

- 猫クリックでターミナルにフォーカスする機能は、VS Code の統合ターミナルで claude を起動している場合のみ動作します。
- hookの登録は `~/.claude/settings.json` を書き換えます。カスタムhookがある場合はバックアップを取ってください。
