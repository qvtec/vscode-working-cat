[![Working Cat Banner](assets/banner.png)](https://github.com/qvtec/vscode-working-cat)

<div align="center">

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/qvtec3.vscode-working-cat?label=VS%20Code%20Marketplace&color=0078d7)](https://marketplace.visualstudio.com/items?itemName=qvtec3.vscode-working-cat)
[![License](https://img.shields.io/github/license/qvtec/vscode-working-cat?color=3fb950)](https://github.com/qvtec/vscode-working-cat/blob/main/LICENSE)

[📦 VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qvtec3.vscode-working-cat) • [🐛 Issues](https://github.com/qvtec/vscode-working-cat/issues) • [📋 Changelog](https://github.com/qvtec/vscode-working-cat/blob/main/CHANGELOG.md) • [🌐 English](README.md)

</div>

VS Code のサイドバーで猫が飼えます。ファイル編集や Claude Code セッションに反応してアニメーションします。

<table><tr>
<td><img src="assets/demo.gif" width="300" /></td>
<td><img src="assets/demo2.png" width="300" /></td>
</tr></table>

## 機能

- **エディタ猫** — タイプ・保存・エラー・アイドルに合わせてアニメーション
- **Claude Code 猫** — セッションが起動するたびに猫が横から走り込んで登場
- **複数セッション対応** — セッションごとに1匹、同時表示可能
- **セッションタイトル表示** — 各猫にセッション名を表示
- **ドラッグ移動** — 猫をドラッグして自由な位置に配置できる
- **鳴き声** — イベントに合わせてにゃーと鳴く（ON/OFF・音量調整可）
- **スヌーズ通知** — パーミッション待ち中に一定間隔で鳴き声でお知らせ
- **背景シーン選択** — お好みの背景を選べる

## 動作環境

- **プラットフォーム**: Windows、macOS、Linux（WSL2含む）
- **VS Code**: 1.70.0 以上
- [Claude Code](https://claude.ai/code)（Claudeセッション連携に必要）

## はじめ方

1. [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qvtec3.vscode-working-cat) からインストール
2. サイドバーの **Working Cat** パネルを開く
3. コーディングを始めると猫が自動で反応します
4. Claude Code セッションを起動すると Claude 猫が登場します

## Claude Code 連携

初回起動時に `~/.claude/settings.json` へ自動でhookを登録し、Claude Code のセッション状態をリアルタイムに反映します。カスタムhookがある場合はバックアップを取ってください。

hookを削除したい場合はコマンドパレットから実行してください：
```
Working Cat: Unregister Claude Code Hooks
```

## 猫が反応するもの

**エディタ操作** — タイプ・保存・診断エラー・アイドル時間。

**Claude Code セッション** — セッション開始、入力待ち、思考中、完了、パーミッション待ち。

**鳴き声** — にゃーって鳴きます。

## 設定

| 設定 | デフォルト | 説明 |
|------|------|------|
| `workingCat.background` | `bg2` | 背景シーン（`bg1`: 日本の家、`bg2`: 公園） |
| `workingCat.sound` | `true` | 鳴き声のON/OFF |
| `workingCat.volume` | `0.5` | 鳴き声の音量（0.0 〜 1.0） |
| `workingCat.snooze` | `false` | パーミッション待ち時のスヌーズ通知のON/OFF |
| `workingCat.snoozeInterval` | `30` | スヌーズ間隔（秒）（10〜300） |
| `workingCat.snoozeCount` | `3` | スヌーズの回数（1〜10） |

