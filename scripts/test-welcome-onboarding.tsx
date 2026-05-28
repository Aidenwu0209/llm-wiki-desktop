import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WelcomePanel } from "../src/components/dashboard/WelcomePanel";

function renderWelcome(language: "zh" | "en") {
  return renderToStaticMarkup(
    <WelcomePanel
      language={language}
      appState={{ recentVaults: [] }}
      suggestions={[]}
      busy={null}
      onChooseVault={() => undefined}
      onToggleLanguage={() => undefined}
      onSelectVault={() => undefined}
      onCreateVault={() => undefined}
      onViewDemoTour={() => undefined}
    />,
  );
}

function count(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

const english = renderWelcome("en");
const chinese = renderWelcome("zh");

assert.equal(count(english, 'class="welcome-onboarding-step"'), 0, "English Welcome should not render the in-project onboarding flow on the start screen.");
assert.equal(count(chinese, 'class="welcome-onboarding-step"'), 0, "Chinese Welcome should not render the in-project onboarding flow on the start screen.");

for (const text of [
  "New Project",
  "Open Project",
  "View Demo Tour",
]) {
  assert.ok(english.includes(text), `English Welcome should contain: ${text}`);
}

for (const text of [
  "新建项目",
  "打开项目",
  "查看 Demo Tour",
]) {
  assert.ok(chinese.includes(text), `Chinese Welcome should contain: ${text}`);
}

for (const text of [
  "OCR + ERNIE Evidence Flow",
  "Parse with PaddleOCR-VL-1.5",
  "Evidence Map",
  "ERNIE Answer",
  "Writeback Proposal",
]) {
  assert.ok(!english.includes(text), `English Welcome should keep in-project flow off the start screen: ${text}`);
}

for (const text of [
  "OCR + ERNIE 证据工作流",
  "使用 PaddleOCR-VL-1.5 解析",
  "文心一言回答",
  "写回提案",
]) {
  assert.ok(!chinese.includes(text), `Chinese Welcome should keep in-project flow off the start screen: ${text}`);
}

assert.ok(english.includes("Synthetic demo"), "Missing real demo vault should render the Demo Tour fallback.");
assert.ok(chinese.includes("合成示例"), "Missing real demo vault should render the Chinese Demo Tour fallback.");

const demoVault = path.resolve("examples/demo-vault");
for (const requiredPath of [
  "README.md",
  "raw/inbox/sample-project.md",
  "raw/inbox/sample-image-placeholder.md",
  "concepts/ocr-ernie-evidence-flow.md",
  "sources/sample-project-source.md",
  "reviews/query-writeback/sample-proposal.md",
  "_state/source-registry.jsonl",
  "_state/artifacts.jsonl",
]) {
  assert.ok(existsSync(path.join(demoVault, requiredPath)), `Demo vault is missing ${requiredPath}`);
}

console.log("Welcome render checks passed.");
