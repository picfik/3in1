# 日常管理台 3in1

现金流、日记与健康记录合并为一个 React + TypeScript PWA。数据按工作区拆成 JSON 分片写入阿里云 OSS；日记图片作为独立 OSS 对象。本机使用 IndexedDB 保存数据和待上传附件。

## 本地开发

需要 Node.js 20+ 与 npm：

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

本地开发时未注入 OSS 环境变量，应用会显示 OSS 未配置提示。线上值由 GitHub Actions 在构建时提供。

## 推送到 GitHub

1. 在 GitHub 新建一个空仓库。
2. 在本目录执行以下命令，并替换仓库地址：

```bash
git init
git add .
git commit -m "Initial 3in1 PWA"
git branch -M main
git remote add origin https://github.com/<用户名>/<仓库名>.git
git push -u origin main
```

3. 打开仓库 `Settings → Pages`，将发布来源选为 **GitHub Actions**。之后推送到 `main` 会自动构建并发布。

## GitHub Actions 配置

在仓库 `Settings → Secrets and variables → Actions` 添加以下值。

**Repository secrets：**

- `OSS_ACCESS_KEY_ID`：专用 RAM 用户的 AccessKey ID。
- `OSS_ACCESS_KEY_SECRET`：对应的 AccessKey Secret。

**Repository variables：**

- `OSS_BUCKET`：OSS Bucket 名称。
- `OSS_REGION`：Bucket 地域标识，例如 `oss-cn-hangzhou`。
- `OSS_ENDPOINT`：地域 Endpoint，例如 `oss-cn-hangzhou.aliyuncs.com`，不带 `https://`。

`.github/workflows/deploy.yml` 会将这些值传给 `npm run build`，Vite 因而会把 AccessKey 编进网页 JavaScript。GitHub Secrets 只在构建过程中隐藏日志值，**不能阻止网站访客从发布文件中提取 AccessKey**。这是此方案刻意接受的风险。务必使用只允许该 Bucket `threeinone/*` 前缀的专用 RAM 用户，禁止使用主账号密钥或授予 Bucket 管理权限；发生泄露时立即禁用并轮换密钥。

## 阿里云 OSS 配置

1. 创建专用 Bucket，访问权限选 **私有**，地域与 `OSS_REGION` 一致。可以开启版本控制，以便恢复被覆盖的 `manifest.json`；数据分片使用不可变唯一对象名。
2. 创建专用 RAM 用户并生成 AccessKey。只授予目标 Bucket 下对象的 `oss:GetObject`、`oss:PutObject`、`oss:DeleteObject`，不要授予 `oss:ListBuckets`、Bucket 配置或账户管理权限。RAM 资源范围应限制在 `acs:oss:*:<账号ID>:<Bucket名称>/threeinone/*`，用实际账号 ID 和 Bucket 名替换占位符。
3. 在 Bucket 的跨域设置中添加 CORS 规则：来源填写你的 GitHub Pages 源站（如 `https://<用户名>.github.io`）；允许方法 `GET`、`PUT`、`DELETE`、`OPTIONS`；允许 Header 至少为 `Content-Type`；暴露 Header 可设 `ETag`。不要设置来源为 `*`。
4. 确认 Bucket Endpoint 与 Actions Variable 中的 `OSS_ENDPOINT` 完全一致。
5. 推送一次代码触发部署。浏览器中显示“已同步 · 云端版本 0”或当前云端版本，即表示读取成功；可创建测试记录并在 OSS 的 `threeinone/` 前缀核对 JSON 对象。

## 数据同步行为

- 每次打开应用，先读取远端 `manifest.json` 和数据分片；读取成功前工作区保持锁定。未配置密钥时也保持锁定，避免在空数据状态下覆盖 OSS。
- 每次修改先写入 IndexedDB，约 900 毫秒无新修改后同步。JSON 按 `cashflow`、`diary`、`health` 分片存储，并做 SHA-256 校验；未变化的分片复用已有对象。
- JSON 分片使用版本号、设备 ID 和随机 UUID 构成不可变对象名；上传前检查远端版本，写入 manifest 后再回读确认。
- 图片添加时立即尝试上传，并保留本机缓存供离线查看；日记 JSON 只保存 OSS object key。删除图片会先提交日记变更，再尝试删除不再引用的 OSS 对象。
- 本机和云端版本不一致时暂停自动覆盖，由用户选择采用云端或覆盖云端。
- **不使用签名服务。**网页用 GitHub Actions 构建时注入的 AccessKey 直接生成最长 10 分钟有效的 OSS URL。

浏览器端版本检查不能实现服务端原子 compare-and-swap：两个设备极短时间内并发提交时，仍可能有一个 manifest 覆盖另一个。OSS Bucket 版本控制可帮助恢复旧 manifest，但不能自动合并两个设备的数据。重要数据应定期导出 JSON。

## 当前功能

- **现金流：**收入、支出、资产买卖、负债偿还、孩子固定支出、现金调整、慈善捐赠、梦想投入、财务自由比例、净现金流/净资产和操作日志。
- **日记：**月历、多篇记录、全文搜索、写作提示、图片附件、编辑与删除。
- **健康：**按日记录血糖、饮水、疼痛、吸烟、体重、血压、心率和睡眠；待办可增删排序，提供历史记录及近 14 条空腹血糖趋势。
- **数据：**IndexedDB 离线保存、JSON 全量导入导出、启动时拉取 OSS 和版本冲突选择。

健康阈值只作记录提示，不构成医学诊断或治疗建议。导入 JSON 会替换三个工作区的数据，请先导出现有备份。