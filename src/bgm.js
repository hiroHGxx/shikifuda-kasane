// BGM は別ファイルを遅延ストリーミング（初回ロードを軽くするため）。
// Artifact 用ビルドでは build-dist.js がこの定数を data URI に置換して単一ファイル化する。
// BGM: 公式配布のキャラクターソング「Freehand」（ネムのテーマ）
// fanworks/assets の「二次創作のBGMや主題歌に自由に使ってください」に基づく
const BGM_DATA = "assets/audio/kasane_bgm.m4a";
// 琴の実サンプル（御霊おとしと共通。AI生成の琴独奏曲から切り出したワンショット）。
// main は単音（基音 196.5Hz / G3）で音程を変えて使い回す。high は装飾フレーズで固定ピッチ再生専用。
const KOTO_MAIN_DATA = "assets/audio/koto_pluck_main.m4a";
const KOTO_HIGH_DATA = "assets/audio/koto_pluck_high.m4a";
// 台詞: 公式公認のキャラボイス制作ルートで生成（fanworks/assets の「声のお約束」に基づき、
// 公式の口調データ（get_spirit の voice.tone / samples）に沿って書き起こした）。
// 鳴る場面は3つ: 開始（栞）／段替わりで新しく現れた御霊の名乗り／八十段の満願（栞）。
// ぴったり浄化は琴の音のみ。
// 餡音・弁天・宇迦・イズナ・咲耶 = 公式配布wavを参照音声に Irodori-TTS でクローン生成。
// 於兎・紫苑・栞 = 公式指定の ElevenLabs Voice ID + 推奨タグで生成。
// ネム・ネコマタ = 公式指定の旧プリセット声（Aria/Charlotte）が現行ElevenLabsから
// 削除されており使用不可のため、公式24キャラ配布ボイスから性格の近い声を代用
// （ネム=呂屯の声・眠たげ / ネコマタ=オロチの声・妖艶）
const VOICE_SRC = {
  // 段替わりで新しく現れた御霊の名乗り
  anne:     "assets/audio/voice_anne.wav",     // わたしがお供するねえ。えへへ、いってみよう
  oto:      "assets/audio/voice_oto.wav",      // ここからは任せて！どんどん重ねちゃおう
  nemu:     "assets/audio/voice_nemu.wav",     // ん、ネムの番。ねむいけど、やる
  nekomata: "assets/audio/voice_nekomata.wav", // あたいの番かい。なら、しくじるんじゃないよ
  benten:   "assets/audio/voice_benten.wav",   // ここからはわっちが。ぬしさん、手元にお気をつけなんし
  uka:      "assets/audio/voice_uka.wav",      // ふふん、あたしの番ね。あんた、ついてきなさいよ
  izuna:    "assets/audio/voice_izuna.wav",    // 私の番ね。あなたなら、まだ登れるかしら
  shion:    "assets/audio/voice_shion.wav",    // 私の番だ。お前の手を、見せてみろ
  sakuya:   "assets/audio/voice_sakuya.wav",   // お待たせ。ここからはあたしが持ってく。あんたも気合い入れて
  // 栞: 開幕（帳が開く）・栞の段・満願
  shiori_start:  "assets/audio/voice_shiori_start.wav",  // 今宵のページを、開きましょう
  shiori_arrive: "assets/audio/voice_shiori_arrive.wav", // 最後のページは、わたくしが
  shiori_goal:   "assets/audio/voice_shiori_goal.wav",   // 月に、届きました。お見事ですこと、あるじどの
};
