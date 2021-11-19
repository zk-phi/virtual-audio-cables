# 外音取り込み君

マイクから取り込んだ音をイヤホンなどに流すツールです。

ブラウザで試す: https://zk-phi.github.io/gaionkun/

Chrome 以外での動作確認してません。

## 音声フィルタ

実験も兼ねて簡単な音声処理も組み込んでみたので、仮想デバイスと組み合わせてお手軽フィルタとしても使えるかもしれません。

内蔵しているのは：

- ノイズ除去
  - Chrome デフォルトのノイズ除去、たぶん中身は RNNoise

- エコー
  - hibiku によくお世話になったので真似してみた https://kazukina.com/hibiku/
  - ハミルトン霊廟のインパルス応答を https://www.openair.hosted.york.ac.uk/ から拝借

- ゲイン
  - 音量調整するやつ

- コンプ
  - デカい音を圧縮して平均の音圧を上げるやつ デフォルト設定

- ローカット + 4 バンド EQ
  - 安物マイク・内蔵マイクのこもった音を良い感じにしたいやつ

- 簡易ディエッサー
  - サ行の刺さりをマイルドにするやつ

ローカット、コンプ以外は無効にできます。

## License

MIT

## Dependencies

- IR Data (Hamilton Mausoleum) by Damian T. Murphy, Licensed under the CC-BY License
- Vue (CSP version) by Evan You, Licensed under the MIT License

Electron version only:

- Electron
- Chromium

(see `LICENSE`, `LICENSE.chromium.html`)
