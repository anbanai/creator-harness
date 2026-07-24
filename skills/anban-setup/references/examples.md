# anban-setup Examples

### Case 1: 首次安装后认证预检

- Input: 用户说“第一次使用，帮我初始化”。
- Recommended path: 用 list_projects 验证 MCP 认证和项目可见性。
- Artifacts: setup-check.md。
- Quality gate: 只报告 ANBAN_API_KEY 是否存在，绝不打印密钥值。

### Case 2: MCP 认证失败诊断

- Input: 任一创作 skill 调 MCP 返回 401/403。
- Recommended path: 切换到 anban-setup，只检查 ANBAN_API_KEY 是否存在（不输出值）、默认项目是否存在，以及 list_projects MCP 工具是否可用。
- Artifacts: diagnostic-report.md。
- Quality gate: 不得绕过 MCP 写自定义 HTTP 客户端。

### Case 3: 官方固定端点连接失败

- Input: 官方插件连接固定端点 https://creator.anbanai.com/mcp 超时。
- Recommended path: 检查 ANBAN_API_KEY 是否存在（不输出值）和官方服务的网络可达性，再重新调用 list_projects。
- Artifacts: connectivity-report.md。
- Quality gate: 固定端点是实现细节，不提供覆盖选项，不回显认证信息。
