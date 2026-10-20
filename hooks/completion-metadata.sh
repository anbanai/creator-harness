#!/usr/bin/env bash
set -euo pipefail
workspace="${CLAUDE_PROJECT_DIR:-}"; [[ -z "$workspace" || ! -d "$workspace" ]] && exit 0
output="$workspace/output"; mkdir -p "$output"
node - "$output" "${ANBAN_TASK_ID:-}" "${ANBAN_EXECUTION_ID:-}" "${ANBAN_TASK_TYPE:-}" <<'JS'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [output,taskId,executionId,taskType]=process.argv.slice(2), out=path.join(output,'completion-metadata.json');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const files=fs.readdirSync(output,{withFileTypes:true}).filter(e=>e.isFile()&&e.name!=='completion-metadata.json').map(e=>e.name).sort();
const artifacts=files.map(name=>({file:`output/${name}`,sha256:hash(fs.readFileSync(path.join(output,name)))}));
let subjects=[], taggingStatus='failed', diagnostic='tagging_missing'; const tp=path.join(output,'content-tags.json');
const validEvidence=item=>item&&typeof item==='object'&&typeof item.source_file==='string'&&item.source_file.trim()&&Number.isInteger(item.line_start)&&item.line_start>0&&Number.isInteger(item.line_end)&&item.line_end>=item.line_start&&typeof item.quote==='string'&&item.quote.trim()&&typeof item.evidence_kind==='string'&&item.evidence_kind.trim();
const validSubjects=value=>Array.isArray(value)&&value.every(subject=>subject&&typeof subject==='object'&&typeof subject.artifact_role==='string'&&subject.artifact_role.trim()&&Array.isArray(subject.tags)&&(subject.omitted_dimensions===undefined||Array.isArray(subject.omitted_dimensions))&&subject.tags.every(tag=>tag&&typeof tag==='object'&&typeof tag.dimension==='string'&&tag.dimension.trim()&&typeof (tag.value||tag.canonical_value)==='string'&&String(tag.value||tag.canonical_value).trim()&&Array.isArray(tag.evidence)&&tag.evidence.length>0&&tag.evidence.every(validEvidence)));
if(fs.existsSync(tp)){try{const x=JSON.parse(fs.readFileSync(tp,'utf8'));if(x.schema_version==='2.0'&&x.taxonomy_version==='2.0'&&validSubjects(x.subjects)){subjects=x.subjects;taggingStatus=x.status==='succeeded'?'succeeded':'failed';diagnostic=taggingStatus==='succeeded'?'':'tagging_not_succeeded'}else diagnostic=x.schema_version==='2.0'&&x.taxonomy_version==='2.0'?'tagging_invalid_subjects':'tagging_invalid_schema'}catch{diagnostic='tagging_invalid_json'}}
fs.writeFileSync(out,JSON.stringify({schema_version:'2.0',taxonomy_version:'2.0',task_id:taskId,execution_id:executionId,task_type:taskType,source_digest:hash(artifacts.map(x=>x.file+':'+x.sha256).join('\n')),evaluation_status:'mechanical',evaluator:'completion-metadata-hook',tagging_status:taggingStatus,feedback_status:'succeeded',tagging_diagnostic:diagnostic,subjects,artifacts,feedback:{scores:{completeness:subjects.length?8:4},errors:subjects.length?'':diagnostic}},null,2)+'\n');
JS
