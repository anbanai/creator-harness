#!/usr/bin/env bash
set -euo pipefail

workspace="${CLAUDE_PROJECT_DIR:-}"
if [[ -z "$workspace" || ! -d "$workspace" ]]; then exit 0; fi
output="$workspace/output"
mkdir -p "$output"
node - "$output" "${ANBAN_TASK_ID:-}" "${ANBAN_EXECUTION_ID:-}" "${ANBAN_TASK_TYPE:-}" <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const [output, taskId, executionId, taskType] = process.argv.slice(2);
const existingMetadata = path.join(output, 'completion-metadata.json');
if ((!taskId || !executionId) && fs.existsSync(existingMetadata)) {
  try {
    const prior = JSON.parse(fs.readFileSync(existingMetadata, 'utf8'));
    if (prior && typeof prior.task_id === 'string' && prior.task_id && typeof prior.execution_id === 'string' && prior.execution_id) process.exit(0);
  } catch {}
}
const files = fs.existsSync(output) ? fs.readdirSync(output, {withFileTypes:true}).filter(e => e.isFile()).map(e => e.name).filter(name => name !== 'completion-metadata.json').sort() : [];
const contentFiles = files.filter(name => /\.(md|txt|json)$/i.test(name));
const contents = contentFiles.map(name => { try { return { name, text: fs.readFileSync(path.join(output, name), 'utf8') }; } catch { return { name, text: '' }; } });
const text = contents.map(item => item.text).join('\n').toLowerCase();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const artifactManifest = files.map(name => ({ file: `output/${name}`, sha256: hash(fs.readFileSync(path.join(output, name))) }));
const sourceDigest = hash(artifactManifest.map(item => `${item.file}:${item.sha256}`).join('\n'));
const tags = [];
const add = (dimension, value, confidence, primary = false, file = contentFiles[0] || files[0] || 'output') => {
  const source = contents.find(item => item.name === file)?.text || text;
  tags.push({dimension, value, canonical_value:value, label_status:'candidate', confidence, primary, evidence:{source_file:`output/${file}`, location:{line:1}, evidence_hash:hash(source)}});
};
const industry = [[/茶叶|茶具|茶/, '茶叶'], [/酒水|白酒|啤酒|葡萄酒/, '酒水'], [/美妆|护肤|化妆/, '美妆'], [/教育|课程|学习/, '教育'], [/软件|saas|ai|人工智能/, '软件']];
for (const [pattern, value] of industry) if (pattern.test(text)) add('industry', value, 0.78, true);
const formats = [[/教程|步骤|怎么做|方法/, 'tutorial'], [/清单|盘点|合集|几种|个方法/, 'listicle'], [/测评|评测|对比|区别/, 'review_compare'], [/故事|经历|案例|人物/, 'story_case'], [/段子|搞笑|幽默/, 'humor'], [/反问|难道|为什么/, 'rhetorical_question']];
for (const [pattern, value] of formats) if (pattern.test(text)) add('format', value, 0.7, tags.every(t => t.dimension !== 'format'));
const intents = [[/购买|下单|转化|优惠|推荐/, 'conversion'], [/种草|好用|体验|值得/, 'discovery'], [/教程|解决|排查|指南/, 'education']];
for (const [pattern, value] of intents) if (pattern.test(text)) add('intent', value, 0.68, tags.every(t => t.dimension !== 'intent'));
const audiences = [[/新手|入门|小白/, 'beginner'], [/老板|企业主|管理者/, 'business_owner'], [/宝妈|妈妈|家庭/, 'parent_family'], [/专业|从业者|行业人士/, 'professional']];
for (const [pattern, value] of audiences) if (pattern.test(text)) add('audience', value, 0.66, tags.every(t => t.dimension !== 'audience'));
const funnel = [[/怎么买|下单|购买|优惠/, 'purchase'], [/测评|对比|怎么选|区别/, 'evaluation'], [/入门|是什么|认识/, 'awareness']];
for (const [pattern, value] of funnel) if (pattern.test(text)) add('funnel_stage', value, 0.64, tags.every(t => t.dimension !== 'funnel_stage'));
const hooks = [[/为什么|难道|真的/, 'rhetorical_question'], [/避坑|别再|误区|踩坑/, 'pain_point'], [/数字|\d+个|\d+种|\d+条/, 'numbered_promise'], [/案例|经历|故事/, 'scenario']];
for (const [pattern, value] of hooks) if (pattern.test(text)) add('narrative_hook', value, 0.67, tags.every(t => t.dimension !== 'narrative_hook'));
const tones = [[/搞笑|段子|幽默/, 'humorous'], [/专业|数据|研究|报告/, 'professional'], [/犀利|吐槽|别再/, 'sharp'], [/温柔|陪伴|共情/, 'empathetic']];
for (const [pattern, value] of tones) if (pattern.test(text)) add('tone', value, 0.63, tags.every(t => t.dimension !== 'tone'));
const values = [[/省钱|便宜|性价比/, 'cost_saving'], [/效率|提速|省时/, 'efficiency'], [/避坑|风险|不要踩/, 'risk_avoidance'], [/好玩|快乐|情绪/, 'emotional_value']];
for (const [pattern, value] of values) if (pattern.test(text)) add('value_proposition', value, 0.63, tags.every(t => t.dimension !== 'value_proposition'));
if (/图片|配图|封面|视觉|image_|cover\.png/.test(text)) add('visual_style', /插画|手绘/.test(text) ? 'illustration' : 'mixed_visual', 0.58, true);
if (/数据|统计|报告|引用|来源|研究/.test(text)) add('evidence_level', 'cited_or_data_supported', 0.62, true);
else if (/经验|我觉得|体会/.test(text)) add('evidence_level', 'experience_based', 0.55, true);
if (taskType) add('media_shape', taskType === 'live-slicer' || taskType === 'montage' ? 'video' : taskType === 'ecommerce' ? 'commerce_visual' : 'text_visual', 0.99, true);
if (files.some(name => /^image_|cover|tail/i.test(name))) add('media_shape', 'multimedia', 0.95, false, 'output');
if (/原创|亲自|我的经历/.test(text)) add('source_relation', 'original', 0.62, true);
else if (/改写|复刻|参考/.test(text)) add('source_relation', 'adapted', 0.62, true);
if (/二维码|加微信|联系方式|外链|进群/.test(text)) add('risk', 'distribution_or_lead_risk', 0.9, true);
else add('risk', 'none_detected', 0.8, true);
const hasContent = files.some(name => /content|article|final|rewritten/i.test(name) && /\.(md|txt)$/i.test(name));
const quality = hasContent && text.length > 100 ? 8 : 5;
const metadata = {version:'1.0', task_id:taskId, execution_id:executionId, task_type:taskType, taxonomy_version:'1.0', source_digest:sourceDigest, evaluation_status:'mechanical', evaluator:'completion-metadata-hook', tagging_status:'succeeded', feedback_status:'succeeded', artifacts:artifactManifest, tags, feedback:{scores:{quality, completeness: hasContent ? 8 : 4, efficiency: 8}, errors:hasContent?'':'final content artifact missing', optimizations:'', summary:`completion metadata evaluated for ${taskType || 'content'}`}};
fs.writeFileSync(path.join(output, 'completion-metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
JS
