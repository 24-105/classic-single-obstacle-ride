import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { access, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { once } from "node:events";
import assert from "node:assert/strict";

class CdpClient {
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", rejectOpen, { once: true });
    });
    return new CdpClient(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => this.handleMessage(event));
  }

  send(method, params = {}) {
    const id = (this.id += 1);
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
    });
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (!message.id || !this.pending.has(message.id)) return;
    const pending = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message));
    } else {
      pending.resolve(message.result || {});
    }
  }

  close() {
    this.socket.close();
  }
}

const root = resolve(".");
const chromePath =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

await access(chromePath);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".mp4": "video/mp4",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(root, `.${normalize(pathname)}`);
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const file = await stat(filePath);
    response.writeHead(200, {
      "content-length": file.size,
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const port = server.address().port;
const appUrl = `http://127.0.0.1:${port}/`;
const debugPort = port + 1000;
const userDataDir = await mkdtemp(join(tmpdir(), "ride-v3-chrome-"));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--enable-unsafe-swiftshader",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  "--window-size=375,667",
  appUrl,
], { stdio: "ignore" });
let chromeExited = false;
chrome.once("exit", () => {
  chromeExited = true;
});

let client;
try {
  const target = await waitForTarget(debugPort);
  client = await CdpClient.connect(target.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await client.send("Page.navigate", { url: appUrl });
  await waitForExpression(client, "document.readyState === 'complete'");
  await waitForExpression(client, "Boolean(document.querySelector('#rideDiagnostics'))");
  await waitForDiagnostics(client, (state) => state?.canvas?.cssWidth === 375);

  const labels = await evaluate(
    client,
    `({
      start: document.querySelector("#startButton")?.textContent.trim(),
      resetHidden: document.querySelector("#resetButton")?.hidden,
      segmentHidden: document.querySelector("#segmentStrip")?.hidden,
      segmentDisplay: getComputedStyle(document.querySelector("#segmentStrip")).display,
      bestLabel: document.querySelector(".high-score-metric .metric-label")?.textContent.trim(),
      skillLabel: document.querySelector("#finalSkillValue")?.previousElementSibling?.textContent.trim(),
      rankExists: Boolean(document.querySelector("#finalRankValue")),
      skillExists: Boolean(document.querySelector("#finalSkillValue")),
      overlayPointerEvents: getComputedStyle(document.querySelector("#gameOverOverlay")).pointerEvents,
      cardPointerEvents: getComputedStyle(document.querySelector(".game-over-card")).pointerEvents,
      commandDisabled: Array.from(document.querySelectorAll(".command-button")).every((button) => button.disabled)
    })`,
  );
  assert.equal(labels.start, "▶ 開始");
  assert.equal(labels.resetHidden, true);
  assert.equal(labels.segmentHidden, true);
  assert.equal(labels.segmentDisplay, "none");
  assert.equal(labels.bestLabel, "最高");
  assert.equal(labels.skillLabel, "神回避/跳び越え");
  assert.equal(labels.rankExists, true);
  assert.equal(labels.skillExists, true);
  assert.equal(labels.overlayPointerEvents, "none");
  assert.equal(labels.cardPointerEvents, "none");
  assert.equal(labels.commandDisabled, true);

  const startRect = await evaluate(
    client,
    `(() => {
      const rect = document.querySelector("#startButton").getBoundingClientRect();
      const style = getComputedStyle(document.querySelector("#startButton"));
      return {
        display: style.display,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom
      };
    })()`,
  );
  assert.notEqual(startRect.display, "none");
  assert.ok(startRect.width > 60);
  assert.ok(startRect.right <= 375);
  assert.ok(startRect.bottom < 80);

  const commandRects = await evaluate(
    client,
    `Array.from(document.querySelectorAll(".command-button")).map((button) => {
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    })`,
  );
  assert.equal(commandRects.length, 3);
  commandRects.forEach((rect) => {
    assert.ok(rect.left >= 0);
    assert.ok(rect.right <= 375);
    assert.ok(rect.width > 70);
  });

  const resultLayout = await evaluate(
    client,
    `(() => {
      const overlay = document.querySelector("#gameOverOverlay");
      const strip = document.querySelector("#segmentStrip");
      const status = document.querySelector("#gameStatus");
      const segment = document.querySelector("#segmentText");
      const score = document.querySelector("#finalScoreValue");
      const best = document.querySelector("#finalBestScoreValue");
      const thanks = document.querySelector(".game-over-thanks");
      const recommend = document.querySelector(".recommend-panel");
      const recommendCards = [...document.querySelectorAll(".recommend-card[href]")];
      overlay.classList.add("is-visible");
      overlay.setAttribute("aria-hidden", "false");
      strip.hidden = false;
      status.textContent = "";
      segment.textContent = "ジャンプ 12秒 +18%";
      score.textContent = "296722";
      best.textContent = "296722";
      score.style.fontSize = "30px";
      best.style.fontSize = "30px";
      const scoreParent = score.closest(".game-over-stat").getBoundingClientRect();
      const bestParent = best.closest(".game-over-stat").getBoundingClientRect();
      const card = document.querySelector(".game-over-card").getBoundingClientRect();
      const commandTop = document.querySelector(".command-bar").getBoundingClientRect().top;
      const stripRect = strip.getBoundingClientRect();
      const statusText = status.textContent;
      return {
        scoreFits: score.scrollWidth <= score.clientWidth,
        bestFits: best.scrollWidth <= best.clientWidth,
        scoreWithin: score.getBoundingClientRect().right <= scoreParent.right,
        bestWithin: best.getBoundingClientRect().right <= bestParent.right,
        stripFits: segment.scrollWidth <= segment.clientWidth,
        stripBottom: stripRect.bottom,
        cardInside: card.left >= 0 && card.right <= 375 && card.bottom <= 667,
        cardClearOfCommands: card.bottom <= commandTop - 8,
        thanksFits: thanks.scrollWidth <= thanks.clientWidth,
        recommendInside: recommend.getBoundingClientRect().left >= card.left &&
          recommend.getBoundingClientRect().right <= card.right,
        recommendCardCount: recommendCards.length,
        recommendListDisplay: getComputedStyle(document.querySelector(".recommend-list")).display,
        overlayPointerEvents: getComputedStyle(overlay).pointerEvents,
        recommendHrefs: recommendCards.map((link) => link.href),
        recommendText: recommend.textContent,
        statusText
      };
    })()`,
  );
  assert.equal(resultLayout.scoreFits, true);
  assert.equal(resultLayout.bestFits, true);
  assert.equal(resultLayout.scoreWithin, true);
  assert.equal(resultLayout.bestWithin, true);
  assert.equal(resultLayout.stripFits, true);
  assert.ok(resultLayout.stripBottom < 230);
  assert.equal(resultLayout.cardInside, true);
  assert.equal(resultLayout.cardClearOfCommands, true);
  assert.equal(resultLayout.thanksFits, true);
  assert.equal(resultLayout.recommendInside, true);
  assert.equal(resultLayout.recommendCardCount, 3);
  assert.notEqual(resultLayout.recommendListDisplay, "none");
  assert.equal(resultLayout.overlayPointerEvents, "auto");
  assert.match(resultLayout.recommendHrefs.join("\n"), /https:\/\/24-105\.github\.io\/machi-narabe\//);
  assert.match(resultLayout.recommendHrefs.join("\n"), /https:\/\/24-105\.github\.io\/kameposu\//);
  assert.match(resultLayout.recommendHrefs.join("\n"), /https:\/\/24-105\.github\.io\/hitoyo-saishucho\//);
  assert.match(resultLayout.recommendText, /次に遊ぶ/);
  assert.match(resultLayout.recommendText, /遊ぶ/);
  assert.doesNotMatch(resultLayout.recommendText, /Coming soon/);
  assert.equal(resultLayout.statusText, "");

  if (process.env.RIDE_RESULT_SCREENSHOT_PATH) {
    await delay(650);
    const resultScreenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await writeFile(
      process.env.RIDE_RESULT_SCREENSHOT_PATH,
      Buffer.from(resultScreenshot.data, "base64"),
    );
  }

  await evaluate(
    client,
    `(() => {
      document.querySelector("#gameOverOverlay").classList.remove("is-visible");
      document.querySelector("#gameOverOverlay").setAttribute("aria-hidden", "true");
      document.querySelector("#segmentStrip").hidden = true;
    })()`,
  );

  if (process.env.RIDE_SCREENSHOT_PATH) {
    await delay(300);
    const initialScreenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await writeFile(
      process.env.RIDE_SCREENSHOT_PATH,
      Buffer.from(initialScreenshot.data, "base64"),
    );
  }

  await clickSelector(client, "#startButton");
  await waitForDiagnostics(client, (state) => state?.state?.running === true);
  assert.equal(await areCommandsDisabled(client), false);
  assert.equal(
    await evaluate(client, `document.querySelector("#startButton").textContent.trim()`),
    "Ⅱ 一時停止",
  );

  await dispatchPointerDown(client, "#startButton");
  const paused = await waitForDiagnostics(
    client,
    (state) => state?.state?.running === false && state?.state?.over === false,
  );
  assert.equal(paused.state.running, false);
  assert.equal(await areCommandsDisabled(client), true);
  assert.equal(
    await evaluate(client, `document.querySelector("#startButton").textContent.trim()`),
    "▶ 再開",
  );
  await clickSelector(client, "#resetButton");
  await delay(150);
  assert.equal(
    await evaluate(client, `document.querySelector("#startButton").textContent.trim()`),
    "▶ 再開",
  );

  const pausedBefore = await readDiagnostics(client);
  await dispatchPointerDown(client, "#leftButton");
  await dispatchPointerDown(client, "#rightButton");
  await dispatchPointerDown(client, "#jumpButton");
  await delay(150);
  const pausedAfter = await readDiagnostics(client);
  assert.equal(pausedAfter.state.lane, pausedBefore.state.lane);
  assert.equal(pausedAfter.state.jumpHeight, pausedBefore.state.jumpHeight);

  const resetVisible = await evaluate(
    client,
    `({
      visible: document.querySelector("#resetButton").hidden === false,
      text: document.querySelector("#resetButton").textContent.trim()
    })`,
  );
  assert.equal(resetVisible.visible, true);
  assert.equal(resetVisible.text, "↻ もう一度");

  await clickSelector(client, "#startButton");
  await waitForDiagnostics(client, (state) => state?.state?.running === true);
  assert.equal(await areCommandsDisabled(client), false);
  await dispatchPointerDown(client, "#jumpButton");
  const jumped = await waitForDiagnostics(
    client,
    (state) => state?.state?.jumpHeight > 0.05 || state?.state?.jumpChain > 0,
  );
  assert.ok(jumped.state.jumpHeight > 0.05 || jumped.state.jumpChain > 0);

  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  assert.ok(screenshot.data.length > 20000);
} finally {
  if (client) client.close();
  if (!chromeExited) {
    chrome.kill("SIGTERM");
    await Promise.race([once(chrome, "exit"), delay(900)]);
  }
  if (!chromeExited) {
    chrome.kill("SIGKILL");
    await Promise.race([once(chrome, "exit"), delay(900)]);
  }
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(userDataDir, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 120,
  });
}

async function waitForTarget(port) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      await delay(100);
    }
  }
  throw new Error("Chrome debug target was not available");
}

async function waitForExpression(client, expression) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function waitForDiagnostics(client, predicate) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const diagnostics = await evaluate(
      client,
      `JSON.parse(document.querySelector("#rideDiagnostics")?.content || "{}")`,
    );
    if (predicate(diagnostics)) return diagnostics;
    await delay(120);
  }
  throw new Error("Timed out waiting for ride diagnostics");
}

async function clickSelector(client, selector) {
  await client.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)}).click()`,
    awaitPromise: true,
  });
}

async function dispatchPointerDown(client, selector) {
  await client.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }))`,
    awaitPromise: true,
  });
}

async function areCommandsDisabled(client) {
  return evaluate(
    client,
    `Array.from(document.querySelectorAll(".command-button")).every((button) => button.disabled)`,
  );
}

async function readDiagnostics(client) {
  return evaluate(
    client,
    `JSON.parse(document.querySelector("#rideDiagnostics")?.content || "{}")`,
  );
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  }
  return result.result.value;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
