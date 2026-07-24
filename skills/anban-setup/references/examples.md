# anban-setup Examples

### Case 1: 首次安装后认证预检

- Input: 用户说“第一次使用，帮我初始化”。
- Recommended path: 用 list_projects 验证 MCP 认证和项目可见性。
- Artifacts: setup-check.md。
- Quality gate: Claude Code：检查插件 `api_key` 是否已配置，不读取环境变量密钥；Codex：用 `test -n "$ANBAN_API_KEY"` 只检查密钥是否存在，绝不打印密钥值。

### Case 2: MCP 认证失败诊断

- Input: 任一创作 skill 调 MCP 返回 401/403。
- Recommended path: 切换到 anban-setup。Claude Code 检查 MCP 工具注入、插件 `api_key` 配置和原始认证错误；Codex 检查 MCP 工具可用性、ANBAN_API_KEY 是否存在（不输出值）和原始认证错误。两种宿主都可检查默认项目是否存在。
- Artifacts: diagnostic-report.md。
- Quality gate: 不得绕过 MCP 写自定义 HTTP 客户端。

### Case 3: 官方固定端点连接失败

- Input: 官方插件连接固定端点 https://creator.anbanai.com/mcp 超时。
- Recommended path: 按宿主检查上述凭据来源和 MCP 工具可用性，再检查官方服务的网络可达性并重新调用 list_projects。
- Artifacts: connectivity-report.md。
- Quality gate: 固定端点是实现细节，不提供覆盖选项，不回显认证信息。
