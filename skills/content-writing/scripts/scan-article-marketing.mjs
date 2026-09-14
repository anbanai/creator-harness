#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [inputPath, reportPath, option] = process.argv.slice(2);
if (!inputPath || !reportPath || (option !== undefined && option !== "--fix")) {
  process.stderr.write("usage: scan-article-marketing.mjs <article.md> <report.json> [--fix]\n");
  process.exit(64);
}

const rules = [
  { id: "external_url", category: "external_link", severity: "block_publish", pattern: /(?:(?:https?:)?\/\/|https?:|mailto:|tel:)[^\s)\]}>，。！？]+/giu, suggestion: "移除外链，将必要信息完整写在文章内。" },
  { id: "contact_phone", category: "contact", severity: "block_publish", pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/gu, suggestion: "移除个人联系方式。" },
  { id: "qr_code", category: "private_traffic", severity: "block_publish", pattern: /二维码|扫码(?:添加|加群|进群|联系|领取)/gu, suggestion: "移除扫码、二维码或站外跳转指引。" },
  { id: "private_contact", category: "private_traffic", severity: "block_publish", pattern: /(?:加|添加)(?:我)?微信|私信我|联系我|进群|加群/gu, suggestion: "改为不绑定私域联系的站内自然交流。" },
  { id: "keyword_reward", category: "engagement_reward", severity: "block_publish", pattern: /回复(?:关键词|“[^”]+”|「[^」]+」|\S{1,12})(?:即可|可)?(?:领|领取|获取|获得|下载)|(?:关注|点赞|留言|评论|转发|分享).{0,12}(?:领|领取|获取|获得|赠送)/gu, suggestion: "取消互动与资料、福利或权益的绑定。" },
  { id: "absolute_claim", category: "advertising_claim", severity: "warning", pattern: /百分百|100%|绝对(?:有效|安全|保证)|全网第一|行业第一|顶级|完美无缺/gu, suggestion: "使用可验证、有限定条件的表述。" },
  { id: "false_promise", category: "promise", severity: "block_publish", pattern: /保证(?:赚钱|盈利|见效)|稳赚不赔|零风险(?:收益|赚钱)|永久有效/gu, suggestion: "删除无法证实的结果承诺。" },
  { id: "medical_efficacy", category: "medical_claim", severity: "block_publish", pattern: /(?:根治|治愈|治疗)(?:癌症|糖尿病|高血压|失眠|抑郁|疾病)|替代(?:药物|就医|治疗)/gu, suggestion: "删除医疗功效或替代正规诊疗的表述。" },
  { id: "misleading_promotion", category: "promotion", severity: "warning", pattern: /仅限今天|最后\d+个名额|错过不再有|史上最低/gu, suggestion: "确认促销事实并补充明确期限和适用条件。" },
];

let article = await readFile(inputPath, "utf8");
const reportFile = reportFilePath(inputPath);
const autoRevision = { attempted: option === "--fix", changed: false, passes: option === "--fix" ? 1 : 0 };
if (option === "--fix") {
  const revised = article.replace(/欢迎私信我(?:交流)?/gu, "欢迎在评论区交流");
  autoRevision.changed = revised !== article;
  article = revised;
  if (autoRevision.changed) await writeFile(inputPath, article);
}

const findings = [];
for (const [lineIndex, line] of article.split(/\r?\n/u).entries()) {
  const scanLine = markdownInlineScanView(line);
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const match of scanLine.matchAll(rule.pattern)) {
      findings.push({
        rule_id: rule.id,
        category: rule.category,
        severity: rule.severity,
        file: reportFile,
        line: lineIndex + 1,
        snippet: redact(line.slice(Math.max(0, match.index - 24), match.index + match[0].length + 24)),
        suggestion: rule.suggestion,
      });
    }
  }
}

function markdownInlineScanView(value) {
  const linkEvidence = [...htmlAnchorDestinations(value), ...markdownAutolinkDestinations(value)];
  let view = value
    .replace(/!\[([^\]]*)\]\((?:\\.|[^)])*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\(((?:\\.|[^)])*)\)/gu, (_match, label, destination) => {
      linkEvidence.push(destination);
      return label;
    })
    .replace(/<[^>\n]+>/gu, "");
  for (let pass = 0; pass < 4; pass += 1) {
    const normalized = view
      .replace(/(\*\*|__|~~)(?=\S)(.*?\S)\1/gu, "$2")
      .replace(/([*_])(?=\S)(.*?\S)\1/gu, "$2")
      .replace(/(`+)([^`\n]*?)\1/gu, "$2");
    if (normalized === view) break;
    view = normalized;
  }
  return normalizeScanValue([view, ...linkEvidence].join("\n"));
}

function htmlAnchorDestinations(value) {
  const destinations = [];
  const anchors = value.matchAll(/<a\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/giu);
  for (const anchor of anchors) {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/iu.exec(anchor[0]);
    const destination = href?.[1] ?? href?.[2] ?? href?.[3];
    if (destination !== undefined) destinations.push(destination);
  }
  return destinations;
}

function markdownAutolinkDestinations(value) {
  return [...value.matchAll(/<((?:(?:https?:)?\/\/|https?:|mailto:|tel:)[^<>\s]+)>/giu)]
    .map((match) => match[1]);
}

function normalizeScanValue(value) {
  return value.normalize("NFKC").replace(/\p{Default_Ignorable_Code_Point}/gu, "");
}

const contentHash = createHash("sha256").update(article).digest("hex");
const status = findings.some((finding) => finding.severity === "block_publish")
  ? "block_publish"
  : findings.length > 0 ? "warning" : "passed";
await writeFile(reportPath, `${JSON.stringify({
  version: "1.0",
  status,
  file: reportFile,
  content_hash: contentHash,
  auto_revision: autoRevision,
  findings,
}, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status, findings: findings.length, content_hash: contentHash })}\n`);

function redact(value) {
  return normalizeScanValue(value)
    .replace(/(?:(?:https?:)?\/\/|https?:|mailto:|tel:)[^\s)\]}>，。！？]+/giu, "[URL]")
    .replace(/(?<!\d)(1[3-9]\d)(\d{4})(\d{4})(?!\d)/gu, "$1****$3");
}

function reportFilePath(value) {
  const normalized = value.replaceAll("\\", "/");
  const outputIndex = normalized.lastIndexOf("/output/");
  if (outputIndex >= 0) return normalized.slice(outputIndex + 1);
  if (normalized.startsWith("output/")) return normalized;
  return normalized.split("/").at(-1);
}
