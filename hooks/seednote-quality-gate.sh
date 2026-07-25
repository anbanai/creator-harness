#!/usr/bin/env bash
# Stop/SubagentStop mechanical gate for the seednote agent.
# Blocks a claimed success when required artifacts or recorded quality state are incomplete.

set -euo pipefail

INPUT="$(cat)"
export HOOK_INPUT="$INPUT"

python3 - <<'PY'
import json
import os
import re
import sys
from pathlib import Path


def block(reason: str) -> None:
    print(json.dumps({"decision": "block", "reason": reason}, ensure_ascii=False))


try:
    payload = json.loads(os.environ.get("HOOK_INPUT", "") or "{}")
except json.JSONDecodeError:
    payload = {}

if payload.get("agent_type") not in ("seednote", "anban:seednote"):
    sys.exit(0)

workspace_root = os.environ.get("CLAUDE_PROJECT_DIR")
if not workspace_root or not workspace_root.strip():
    block("种子笔记机械闸门无法运行：missing runtime workspace injection (CLAUDE_PROJECT_DIR)")
    sys.exit(0)

root = Path(workspace_root)

failure_path = root / "output" / "failure-state.json"
if failure_path.is_file():
    try:
        failure = json.loads(failure_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        block(f"种子笔记失败态文件无效（{failure_path}）：{exc}")
        sys.exit(0)
    required_failure_fields = ("status", "stage", "error_code", "message", "resume_from")
    missing_failure_fields = [name for name in required_failure_fields if not failure.get(name)]
    if failure.get("status") != "recoverable_failure" or missing_failure_fields:
        block(
            f"种子笔记失败态文件不完整（{failure_path}）：status 必须为 recoverable_failure，"
            f"缺失字段={missing_failure_fields}"
        )
        sys.exit(0)
    # A structured recoverable failure is an honest terminal outcome. The
    # server rejects it as business success while preserving uploaded files.
    sys.exit(0)

output_dir = root / "output"
seednote_dir = output_dir
missing: list[str] = []
actual_image_names: list[str] = []

required_artifacts = {
    "content.md": "最终正文",
    "request-analysis.json": "结构化需求分析",
    "request-analysis.md": "可读需求分析",
    "reference-analysis.json": "结构化参考素材分析",
    "reference-analysis.md": "可读参考素材分析",
    "image-plan.md": "视觉规划",
    "image-prompts.md": "生成记录",
    "image-review.md": "内容质量观察记录",
    "reference-usage-summary.json": "参考素材与内容质量汇总",
}
for name, purpose in required_artifacts.items():
    if not (seednote_dir / name).is_file():
        missing.append(f"output/{name}（缺少{purpose}）")

plan_path = seednote_dir / "image-plan.md"
if plan_path.is_file():
    plan = plan_path.read_text(encoding="utf-8", errors="replace")
    match = re.search(r"计划图片数量[:：]\s*(\d+)", plan)
    if not match:
        missing.append("output/image-plan.md 缺「计划图片数量」字段（说明 skill 步骤 3 未执行）")
    else:
        expected = int(match.group(1))
        content_candidates = [
            p
            for p in seednote_dir.iterdir()
            if p.is_file() and p.name.startswith("image_")
        ]
        content_pattern = re.compile(r"image_0[1-3]\.png")
        invalid_content_names = sorted(
            p.name for p in content_candidates if not content_pattern.fullmatch(p.name)
        )
        if invalid_content_names:
            missing.append(
                "非规范内容图文件名（只允许 image_01.png、image_02.png、image_03.png）："
                + ", ".join(invalid_content_names)
            )
        content_images = [p for p in content_candidates if content_pattern.fullmatch(p.name)]
        content_names = sorted(p.name for p in content_images)
        expected_content_names = [f"image_{index:02d}.png" for index in range(1, len(content_names) + 1)]
        if content_names != expected_content_names:
            missing.append(
                "内容图编号必须从 image_01.png 开始连续且不得跳号"
                f"（当前 {content_names}，应为 {expected_content_names}）"
            )
        images = content_images + [
            p for name in ("cover.png", "tail.png") if (p := seednote_dir / name).is_file()
        ]
        for image_path in images:
            try:
                if image_path.stat().st_size <= 0:
                    missing.append(f"output/{image_path.name}（图片文件为空）")
                    continue
                with image_path.open("rb") as image_file:
                    header = image_file.read(8)
            except OSError as exc:
                missing.append(f"output/{image_path.name}（图片文件无法读取：{exc}）")
                continue
            if header != b"\x89PNG\r\n\x1a\n":
                missing.append(f"output/{image_path.name}（文件内容不是有效 PNG）")
        actual_image_names = sorted(p.name for p in images)
        image_count = len(images)
        if image_count != expected:
            missing.append(f"图片数量（当前 {image_count} 张，应等于 image-plan.md 声明的 {expected} 张）")
        if not (seednote_dir / "cover.png").is_file():
            missing.append("output/cover.png（封面必选）")

summary_path = seednote_dir / "reference-usage-summary.json"
if summary_path.is_file():
    try:
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        missing.append(f"output/reference-usage-summary.json 无法解析：{exc}")
    else:
        outputs = summary.get("outputs")
        if not isinstance(outputs, list) or not outputs:
            missing.append("reference-usage-summary.json.outputs 为空，未记录逐图内容质量结论")
        else:
            summary_image_names: list[str] = []
            for output in outputs:
                if not isinstance(output, dict):
                    missing.append("reference-usage-summary.json.outputs 含非对象条目")
                    continue
                filename = output.get("file_name")
                if not isinstance(filename, str) or not filename.strip():
                    missing.append("reference-usage-summary.json.outputs 含缺失 file_name 的条目")
                    filename = "<unknown>"
                else:
                    filename = filename.strip()
                    summary_image_names.append(filename)
                quality_status = output.get("quality_status")
                if quality_status != "accepted":
                    missing.append(f"{filename} 内容质量状态未通过（quality_status={quality_status or 'missing'}）")
            if (
                len(summary_image_names) != len(set(summary_image_names))
                or sorted(summary_image_names) != actual_image_names
            ):
                missing.append(
                    "reference-usage-summary.json.outputs 必须与实际图片唯一且完全一致"
                    f"（汇总 {summary_image_names}，实际 {actual_image_names}）"
                )

if missing:
    block(
        f"种子笔记机械闸门未通过（{seednote_dir}），缺失：\n"
        + "".join(f"  - {item}\n" for item in missing)
        + "\n请完成 seednote-visual-design 规划、逐图生成和内容质量记录，并将全部产物留在 output/。"
        + "只有 generate_image 失败才写结构化 output/failure-state.json；analyze_image 不可用只记录 warning。"
    )

sys.exit(0)
PY
