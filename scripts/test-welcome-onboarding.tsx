import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WelcomePanel } from "../src/components/dashboard/WelcomePanel";
import type { VaultSuggestion } from "../src/types";

function renderWelcome(language: "zh" | "en", suggestions: VaultSuggestion[] = []) {
  return renderToStaticMarkup(
    <WelcomePanel
      language={language}
      appState={{ recentVaults: [] }}
      suggestions={suggestions}
      busy={null}
      onChooseVault={() => undefined}
      onToggleLanguage={() => undefined}
      onSelectVault={() => undefined}
      onCreateVault={() => undefined}
    />,
  );
}

function renderCreateModal(language: "zh" | "en") {
  return renderToStaticMarkup(
    <WelcomePanel
      modalOnly
      createOpen
      language={language}
      appState={{ recentVaults: [] }}
      suggestions={[]}
      busy={null}
      defaultParentDirectory="/Users/demo/Wikis"
      onChooseVault={() => undefined}
      onToggleLanguage={() => undefined}
      onSelectVault={() => undefined}
      onCreateVault={() => undefined}
      onCreateProject={() => true}
    />,
  );
}

function count(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

const english = renderWelcome("en");
const chinese = renderWelcome("zh");
const englishCreateModal = renderCreateModal("en");
const chineseCreateModal = renderCreateModal("zh");

assert.equal(count(english, 'class="welcome-onboarding-step"'), 0, "English Welcome should not render the in-project onboarding flow on the start screen.");
assert.equal(count(chinese, 'class="welcome-onboarding-step"'), 0, "Chinese Welcome should not render the in-project onboarding flow on the start screen.");

for (const text of [
  "New Project",
  "Open Project",
  "Detected Projects",
]) {
  assert.ok(english.includes(text), `English Welcome should contain: ${text}`);
}

for (const text of [
  "新建项目",
  "打开项目",
  "已检测项目",
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

for (const text of [
  "Demo & Detected",
  "View Demo Tour",
  "Synthetic demo",
  "Open DeepSeek demo vault",
]) {
  assert.ok(!english.includes(text), `English Welcome should not show demo entry copy: ${text}`);
}

for (const text of [
  "Demo 和已检测项目",
  "查看 Demo Tour",
  "合成示例",
  "打开 DeepSeek 演示知识库",
]) {
  assert.ok(!chinese.includes(text), `Chinese Welcome should not show demo entry copy: ${text}`);
}

assert.ok(englishCreateModal.includes("Create New Wiki Project"), "Modal-only render should expose the English project creation dialog.");
assert.ok(chineseCreateModal.includes("创建新的 Wiki 项目"), "Modal-only render should expose the Chinese project creation dialog.");
assert.ok(!englishCreateModal.includes("Open Project"), "Modal-only render should not include the full welcome screen actions.");
assert.ok(!chineseCreateModal.includes("打开项目"), "Modal-only render should not include the full welcome screen actions.");

const detectedProject = {
  label: "DeepSeek corpus",
  path: "/Users/example/DeepSeek Wiki",
  kind: "deepseek",
  exists: true,
};
const detectedEnglish = renderWelcome("en", [detectedProject]);
const detectedChinese = renderWelcome("zh", [detectedProject]);
assert.ok(detectedEnglish.includes("DeepSeek corpus"), "English Welcome should render detected projects.");
assert.ok(detectedChinese.includes("DeepSeek corpus"), "Chinese Welcome should render detected projects.");
assert.ok(detectedEnglish.includes("/Users/example/DeepSeek Wiki"), "English Welcome should show the detected project path.");
assert.ok(detectedChinese.includes("/Users/example/DeepSeek Wiki"), "Chinese Welcome should show the detected project path.");

console.log("Welcome render checks passed.");
