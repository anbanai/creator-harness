#!/usr/bin/env bash
# Stop/SubagentStop mechanical gate for the seednote agent.
# Blocks a claimed success when required artifacts or recorded quality state are incomplete.

set -euo pipefail

INPUT="$(cat)"
export HOOK_INPUT="$INPUT"

node <<'JS'
const fs = require("node:fs");
const path = require("node:path");

function block(reason) {
  process.stdout.write(`{"decision": "block", "reason": ${JSON.stringify(reason)}}`);
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

let payload = {};
try {
  payload = JSON.parse(process.env.HOOK_INPUT || "{}");
} catch {
  payload = {};
}

if (!['seednote', 'anban:seednote'].includes(payload.agent_type)) {
  process.exit(0);
}

const workspaceRoot = process.env.CLAUDE_PROJECT_DIR;
if (!workspaceRoot || !workspaceRoot.trim()) {
  block("种子笔记机械闸门无法运行：missing runtime workspace injection (CLAUDE_PROJECT_DIR)");
  process.exit(0);
}

const outputDir = path.join(workspaceRoot, "output");
const failurePath = path.join(outputDir, "failure-state.json");
if (isFile(failurePath)) {
  let failure;
  try {
    failure = JSON.parse(fs.readFileSync(failurePath, "utf8"));
  } catch (error) {
    block(`种子笔记失败态文件无效（${failurePath}）：${error}`);
    process.exit(0);
  }
  const requiredFailureFields = ["status", "stage", "error_code", "message", "resume_from"];
  const missingFailureFields = requiredFailureFields.filter((name) => !failure[name]);
  if (failure.status !== "recoverable_failure" || missingFailureFields.length > 0) {
    block(
      `种子笔记失败态文件不完整（${failurePath}）：status 必须为 recoverable_failure，` +
      `缺失字段=${JSON.stringify(missingFailureFields)}`
    );
    process.exit(0);
  }
  // A structured recoverable failure is an honest terminal outcome. The
  // server rejects it as business success while preserving uploaded files.
  process.exit(0);
}

const missing = [];
let actualImageNames = [];

if (payload.task_type === "viral_analysis") {
  const requiredViralArtifacts = {
    "source-analysis.md": "源笔记证据拆解",
    "viral-template.json": "爆款结构模板",
  };
  for (const [name, purpose] of Object.entries(requiredViralArtifacts)) {
    if (!isFile(path.join(outputDir, name))) missing.push(`output/${name}（缺少${purpose}）`);
  }
  if (missing.length > 0) {
    block(
      `爆款分析机械闸门未通过（${outputDir}），缺失：\n` +
      missing.map((item) => `  - ${item}\n`).join("") +
      "\n请完成源笔记证据拆解，并将分析产物留在 output/。"
    );
  }
  process.exit(0);
}

const requiredArtifacts = {
  "content.md": "最终正文",
  "request-analysis.json": "结构化需求分析",
  "request-analysis.md": "可读需求分析",
  "reference-analysis.json": "结构化参考素材分析",
  "reference-analysis.md": "可读参考素材分析",
  "image-plan.md": "视觉规划",
  "image-prompts.md": "生成记录",
  "image-review.md": "内容质量观察记录",
  "reference-usage-summary.json": "参考素材与内容质量汇总",
};
for (const [name, purpose] of Object.entries(requiredArtifacts)) {
  if (!isFile(path.join(outputDir, name))) missing.push(`output/${name}（缺少${purpose}）`);
}

const planPath = path.join(outputDir, "image-plan.md");
if (isFile(planPath)) {
  const plan = fs.readFileSync(planPath, "utf8");
  const match = /计划图片数量[:：]\s*(\d+)/.exec(plan);
  if (!match) {
    missing.push("output/image-plan.md 缺「计划图片数量」字段（说明 skill 步骤 3 未执行）");
  } else {
    const expected = Number.parseInt(match[1], 10);
    const contentCandidates = fs.readdirSync(outputDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.startsWith("image_"))
      .map((entry) => entry.name);
    const contentPattern = /^image_0[1-3]\.png$/;
    const invalidContentNames = contentCandidates.filter((name) => !contentPattern.test(name)).sort();
    if (invalidContentNames.length > 0) {
      missing.push(
        "非规范内容图文件名（只允许 image_01.png、image_02.png、image_03.png）：" +
        invalidContentNames.join(", ")
      );
    }
    const contentNames = contentCandidates.filter((name) => contentPattern.test(name)).sort();
    const expectedContentNames = contentNames.map((_, index) => `image_${String(index + 1).padStart(2, "0")}.png`);
    if (JSON.stringify(contentNames) !== JSON.stringify(expectedContentNames)) {
      missing.push(
        "内容图编号必须从 image_01.png 开始连续且不得跳号" +
        `（当前 ${JSON.stringify(contentNames)}，应为 ${JSON.stringify(expectedContentNames)}）`
      );
    }
    const imageNames = [...contentNames, ...["cover.png", "tail.png"].filter((name) => isFile(path.join(outputDir, name)))];
    for (const name of imageNames) {
      const imagePath = path.join(outputDir, name);
      try {
        if (fs.statSync(imagePath).size <= 0) {
          missing.push(`output/${name}（图片文件为空）`);
          continue;
        }
        const header = fs.readFileSync(imagePath).subarray(0, 8);
        if (!header.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
          missing.push(`output/${name}（文件内容不是有效 PNG）`);
        }
      } catch (error) {
        missing.push(`output/${name}（图片文件无法读取：${error}）`);
      }
    }
    actualImageNames = [...imageNames].sort();
    if (imageNames.length !== expected) {
      missing.push(`图片数量（当前 ${imageNames.length} 张，应等于 image-plan.md 声明的 ${expected} 张）`);
    }
    if (!isFile(path.join(outputDir, "cover.png"))) missing.push("output/cover.png（封面必选）");
  }
}

const summaryPath = path.join(outputDir, "reference-usage-summary.json");
if (isFile(summaryPath)) {
  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  } catch (error) {
    missing.push(`output/reference-usage-summary.json 无法解析：${error}`);
  }
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    missing.push("output/reference-usage-summary.json 必须为 JSON 对象");
  } else {
    const outputs = summary.outputs;
    if (!Array.isArray(outputs) || outputs.length === 0) {
      missing.push("reference-usage-summary.json.outputs 为空，未记录逐图内容质量结论");
    } else {
      const summaryImageNames = [];
      for (const output of outputs) {
        if (!output || typeof output !== "object" || Array.isArray(output)) {
          missing.push("reference-usage-summary.json.outputs 含非对象条目");
          continue;
        }
        let filename = output.file_name;
        if (typeof filename !== "string" || !filename.trim()) {
          missing.push("reference-usage-summary.json.outputs 含缺失 file_name 的条目");
          filename = "<unknown>";
        } else {
          filename = filename.trim();
          summaryImageNames.push(filename);
        }
        if (output.quality_status !== "accepted") {
          missing.push(`${filename} 内容质量状态未通过（quality_status=${output.quality_status || "missing"}）`);
        }
      }
      const sortedSummaryNames = [...summaryImageNames].sort();
      if (
        summaryImageNames.length !== new Set(summaryImageNames).size ||
        JSON.stringify(sortedSummaryNames) !== JSON.stringify(actualImageNames)
      ) {
        missing.push(
          "reference-usage-summary.json.outputs 必须与实际图片唯一且完全一致" +
          `（汇总 ${JSON.stringify(summaryImageNames)}，实际 ${JSON.stringify(actualImageNames)}）`
        );
      }
    }
  }
}

if (missing.length > 0) {
  block(
    `种子笔记机械闸门未通过（${outputDir}），缺失：\n` +
    missing.map((item) => `  - ${item}\n`).join("") +
    "\n请完成 seednote-visual-design 规划、逐图生成和内容质量记录，并将全部产物留在 output/。" +
    "只有 generate_image 失败才写结构化 output/failure-state.json；analyze_image 不可用只记录 warning。"
  );
}
JS
