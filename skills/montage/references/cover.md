# 普通视频封面

仅当 `cover_portrait` 未启用时执行。依据最终视频 brief、标题与素材，选择产品、界面、道具或场景为主视觉；不使用项目人物参考，也不因上传了人物图切换到人物封面。

写 `output/cover-plan.md` 和 `output/cover-prompt.md`，明确短标题原文、分行、主体、风格和四边约 10% 安全区。比例按 `montage-input.json` 中冻结的完整 `output_profile` 执行，封面宽高比必须为其 `aspect_ratio`，不得从 Cloud 消息读取 `$VIDEO_ASPECT_RATIO` 或自行推断尺寸。需要风格细化时只读 `portrait-cover-design/references/style-01` 至 `style-06` 中一个适用模板，省略人物占位。

调用 `generate_image(project_id=$PROJECT_ID, task_id=$TASK_ID, image_type="cover", output_path="output/cover.png", aspect_ratio=<frozen output_profile.aspect_ratio>, prompt=<完整提示词>, ref_image_paths=<与主视觉相关的非人物任务素材>)`，按冻结 profile 的 `width` 和 `height` 验证尺寸，再独立 `analyze_image` 检查主题、标题逐字准确、比例和安全区。结果写 `output/cover-quality.json`；最多 3 次生成，通过才标记 `overall_pass=true`。耗尽后保留产物，按 Montage 失败合同停止，不能把失败封面交付为成功。
