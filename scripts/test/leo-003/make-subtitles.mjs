import { writeFileSync } from "node:fs";
import { join } from "node:path";

const outputDir = join(process.cwd(), "scripts", "test", "leo-003", "output");

// 中英雙語字幕分段
const subs = [
  [0, 4,    "這不是運氣差",                      "This was not bad luck."],
  [4, 8,    "是一場教科書級的事故",               "It was a textbook-level accident."],
  [8, 13,   "一九九五年，二十八歲的尼克·李森",      "In 1995, 28-year-old trader Nick Leeson"],
  [13, 17,  "一個人搞垮了兩百三十三年歷史的霸菱銀行", "single-handedly brought down the 233-year-old Barings Bank."],
  [17, 21,  "他本來該做最安全的套利交易",           "He was supposed to do the safest arbitrage trades,"],
  [21, 25,  "在新加坡和東京之間賺取微小價差",        "earning tiny spreads between Singapore and Tokyo."],
  [25, 29,  "但他偷偷賭方向",                      "But he secretly bet on market direction"],
  [29, 33,  "把虧損藏進一個秘密帳戶，越輸越加倉",    "hid losses in a secret account, and doubled down."],
  [33, 38,  "最終虧掉十四億美元",                   "In the end, he lost 1.4 billion dollars."],
  [38, 42,  "這堂課告訴我們",                      "The lesson here is clear:"],
  [42, 47,  "沒有風控的交易不是交易，是賭博",        "trading without risk control is not trading — it is gambling."],
];

function toTime(s) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2);
  return `0:${String(m).padStart(2, "0")}:${sec.padStart(5, "0")}`;
}

let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1440
PlayResY: 1440
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ZH,Microsoft YaHei,36,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,80,80,60,1
Style: EN,Microsoft YaHei,22,&H00FFFF80,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,2,80,80,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

for (const [start, end, zh, en] of subs) {
  ass += `Dialogue: 0,${toTime(start)},${toTime(end)},ZH,,0,0,0,,${zh}\n`;
  ass += `Dialogue: 0,${toTime(start)},${toTime(end)},EN,,0,0,0,,${en}\n`;
}

writeFileSync(join(outputDir, "subtitles.ass"), ass);
console.log("subtitles.ass written:", ass.length, "chars");
