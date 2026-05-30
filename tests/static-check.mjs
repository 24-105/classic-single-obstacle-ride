import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const [html, js, css, readme, robots, sitemap, favicon] = await Promise.all([
  readFile("index.html", "utf8"),
  readFile("src/main.js", "utf8"),
  readFile("src/styles.css", "utf8"),
  readFile("README.md", "utf8"),
  readFile("robots.txt", "utf8"),
  readFile("sitemap.xml", "utf8"),
  readFile("favicon.svg", "utf8"),
]);

function numberConstant(name) {
  const match = js.match(new RegExp(`const ${name} = ([0-9.]+);`));
  assert.ok(match, `${name} is missing`);
  return Number(match[1]);
}

assert.equal(numberConstant("MAX_DIFFICULTY_LEVEL"), 9999);
assert.ok(numberConstant("JUMP_BASE_VELOCITY") >= 4.9);
assert.ok(numberConstant("JUMP_MIN_VELOCITY") >= 3.7);
assert.ok(numberConstant("JUMP_GRAVITY") <= 9.8);
assert.ok(numberConstant("JUMP_CLEARANCE_ASSIST") >= 0.12);

assert.match(js, /const GAME_VERSION = "v3";/);
assert.match(js, /segmentConfigs/);
assert.match(js, /shortLabel: "ジャンプ"/);
assert.match(js, /effect: "\+18%"/);
assert.match(js, /jumpRail/);
assert.match(js, /roadCut/);
assert.match(js, /sign/);
assert.match(js, /function spawnJumpChicane/);
assert.match(js, /function spawnConstructionSqueeze/);
assert.match(js, /function getResultRank/);
assert.match(js, /function setCommandButtonsState/);
assert.match(js, /function loadRecommendCards/);
assert.match(js, /function resolveRecommendPageMeta/);
assert.match(js, /function extractRecommendGenre/);
assert.match(js, /function findPreferredFaviconLink/);
assert.match(js, /let recommendCardsLoaded = false;/);
assert.match(js, /function showGameOver\(\) \{[\s\S]*loadRecommendCards\(\);[\s\S]*gameOverOverlay\.classList\.add\("is-visible"\);/);
assert.doesNotMatch(js, /resetGame\(\);\n\s+loadRecommendCards\(\);/);
assert.match(js, /const disabled = !game\.running \|\| game\.over;/);
assert.match(js, /if \(!game\.running \|\| game\.over\) \{\n\s+return;\n\s+\}/);
assert.match(js, /if \(rankScore >= 380\) return "SSS";/);
assert.match(js, /if \(rankScore >= 165\) return "S";/);
assert.match(js, /Math\.pow\(level \/ 1800, 0\.82\)/);
assert.match(js, /Math\.max\(0, level - 220\) \/ 1400/);
assert.match(js, /if \(game\.over\) \{\n\s+gameStatus\.textContent = "";/);
assert.match(js, /危険レーン/);
assert.doesNotMatch(js, /skillScore/);
assert.doesNotMatch(js, /formatPaddedNumber/);
assert.doesNotMatch(js, /ポーズ解除|危険ルート/);

function previewRank({
  score,
  bestCombo = 1,
  totalJumpDodges = 0,
  totalPerfects = 0,
  godDodges = 0,
  bestPerfectChain = 0,
}) {
  const rankScore =
    Math.floor(score / 18000) +
    bestCombo * 0.75 +
    totalJumpDodges * 1.25 +
    totalPerfects * 1.8 +
    godDodges * 4.2 +
    bestPerfectChain * 1.4;
  if (rankScore >= 380) return "SSS";
  if (rankScore >= 250) return "SS";
  if (rankScore >= 165) return "S";
  if (rankScore >= 85) return "A";
  if (rankScore >= 35) return "B";
  return "C";
}

assert.equal(
  previewRank({ score: 562608, bestCombo: 14, totalJumpDodges: 6 }),
  "B",
);
assert.notEqual(
  previewRank({
    score: 562608,
    bestCombo: 14,
    totalJumpDodges: 18,
    totalPerfects: 22,
    godDodges: 6,
    bestPerfectChain: 8,
  }),
  "S",
);
assert.equal(
  previewRank({
    score: 4800000,
    bestCombo: 16,
    totalJumpDodges: 70,
    totalPerfects: 85,
    godDodges: 35,
    bestPerfectChain: 20,
  }),
  "SSS",
);

assert.match(html, /<title>自転車ダッシュ \| スマホで遊べる3D障害物回避ゲーム<\/title>/);
assert.match(html, /name="description"/);
assert.match(html, /name="application-name" content="自転車ダッシュ"/);
assert.match(html, /name="apple-mobile-web-app-title" content="自転車ダッシュ"/);
assert.match(html, /property="og:title"/);
assert.match(html, /property="og:image"[\s\S]*content="https:\/\/24-105\.github\.io\/classic-single-obstacle-ride\/favicon\.svg"/);
assert.match(html, /name="twitter:card" content="summary"/);
assert.match(html, /name="twitter:image"[\s\S]*content="https:\/\/24-105\.github\.io\/classic-single-obstacle-ride\/favicon\.svg"/);
assert.match(html, /rel="canonical" href="https:\/\/24-105\.github\.io\/classic-single-obstacle-ride\/"/);
assert.match(html, /<link rel="icon" href="\.\/favicon\.svg" type="image\/svg\+xml" \/>/);
assert.match(html, /id="segmentStrip"/);
assert.match(html, /id="segmentText"/);
assert.match(html, /id="finalRankValue"/);
assert.match(html, /id="finalComboValue"/);
assert.match(html, /id="finalSkillValue"/);
assert.match(html, /class="game-over-thanks"/);
assert.match(html, /おすすめ/);
assert.match(html, /href="https:\/\/24-105\.github\.io\/machi-narabe\/"/);
assert.match(html, /href="https:\/\/24-105\.github\.io\/kameposu\/"/);
assert.match(html, /href="https:\/\/24-105\.github\.io\/hitoyo-saishucho\/"/);
assert.match(html, /ブックマークしてまた遊んでね/);
assert.doesNotMatch(html, />0{4,}</);
assert.doesNotMatch(html, /Coming soon/);
assert.doesNotMatch(html, /目標/);
assert.doesNotMatch(html, /v3|START|RESET|PAUSE|RUSH|SCORE|BEST|GOAL|ライド操作/);

assert.match(css, /\.game-over-rank/);
assert.match(css, /\.game-over-stats/);
assert.match(css, /\.game-over-main-stat/);
assert.match(css, /\.game-over-thanks/);
assert.match(css, /\.recommend-panel/);
assert.match(css, /\.recommend-card/);
assert.match(css, /\.recommend-card-art/);
assert.match(css, /\.recommend-favicon/);
assert.match(css, /\.recommend-card-copy :empty/);
assert.match(css, /\.game-over-overlay\.is-visible \{\n\s+opacity: 1;\n\s+pointer-events: auto;/);
assert.match(css, /\.segment-strip/);
assert.match(css, /\.command-button:disabled/);
assert.match(css, /\.command-button:not\(:disabled\):active/);

assert.match(readme, /# 自転車ダッシュ/);
assert.match(readme, /ジャンプ区間/);
assert.match(readme, /低い黄色バー/);
assert.match(readme, /神回避/);
assert.doesNotMatch(readme, /Light Bicycle Dash|RUSH|Build command|Publish directory|プロシージャル|ベストスコア/);

const ldJsonMatch = html.match(
  /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/,
);
assert.ok(ldJsonMatch, "JSON-LD is missing");
const structuredData = JSON.parse(ldJsonMatch[1]);
assert.equal(structuredData["@type"], "VideoGame");
assert.equal(structuredData.name, "自転車ダッシュ");
assert.equal(structuredData.applicationCategory, "GameApplication");
assert.deepEqual(structuredData.gamePlatform, ["Web browser", "Mobile browser"]);
assert.equal(structuredData.genre[0], "障害物回避");
assert.equal(structuredData.playMode, "SinglePlayer");
assert.equal(structuredData.isAccessibleForFree, true);
assert.equal(structuredData.image, "https://24-105.github.io/classic-single-obstacle-ride/favicon.svg");
assert.equal(structuredData.offers.price, "0");

assert.match(robots, /User-agent: \*/);
assert.match(robots, /Sitemap: https:\/\/24-105\.github\.io\/classic-single-obstacle-ride\/sitemap\.xml/);
assert.match(sitemap, /<loc>https:\/\/24-105\.github\.io\/classic-single-obstacle-ride\/<\/loc>/);
assert.match(favicon, /<svg/);
assert.match(favicon, /aria-label="自転車ダッシュ"/);
