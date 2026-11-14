# 3in1 项目约定

- 使用 React、TypeScript、Vite 和现有 CSS 设计，不在三个工作区之间复制整页样式。
- 业务数据统一使用 `src/types/models.ts` 的 JSON 结构，并通过 `src/store/db.ts` 持久化到 IndexedDB。
- OSS AccessKey 由 GitHub Actions Secrets 提供给构建；项目采用浏览器端 URL 签名，密钥会进入公开前端产物，不能把它视为保密凭据。
- 远端数据分片使用不可变 JSON 对象；浏览器直接 PUT manifest 并回读校验。启动必须先拉取远端后开放编辑。
- 新数据或附件必须在本机保留后再同步；遇到版本冲突不能静默覆盖。
- 修改数据模型时同步考虑 JSON 导入导出、IndexedDB 升级、OSS 兼容和 README。
- 前端构建命令为 `npm run build`；OSS 配置通过 GitHub Actions Secrets 和 Variables 注入。
