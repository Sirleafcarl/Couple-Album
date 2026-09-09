# Couple Album · 我们的故事

面向两位固定用户的自托管私人相册项目。支持保存原图、后台生成预览、共同维护相册，以及按年份选择相册廊主题。

> 当前是开发中的版本，不是功能全部完成的正式发布。代码公开不代表网站或照片公开；部署时仍需要登录，并应配置 HTTPS、备份和安全访问。

## 本地启动

需要 Node.js 24+、pnpm 11.8.0 和 Docker Compose。

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:up
pnpm --filter @memory/db db:migrate
pnpm --filter @memory/api user:create -- --email first@example.com --name First
pnpm --filter @memory/api user:create -- --email second@example.com --name Second
pnpm dev
```

创建账号时交互输入密码。打开 <http://localhost:5173>。示例数据库账号仅用于本地开发，不应直接暴露到公网。

## 当前功能与限制

- 两位固定账号、个人照片库、共同相册、上传及原图存储。
- 独立 Worker 生成缩略图和预览；相册照片引用可添加、排序及移除。
- 11 套现代主题首版与 3 套经典主题，年度设置持久化。
- 主题仍在视觉精修；公开版「神圣快乐」使用中性天空占位图。
- 音乐、删除确认、30 天回收站等功能尚未完整接入，请勿将计划当作已实现功能。

完整启动、数据目录及测试说明见 [本地开发指南](docs/local-development.md)。测试会使用独立的 `memory_test` 数据库，运行前请阅读说明。

## 公开版本与隐私

这是经过筛选的源码快照，不包含私人照片、真实数据库、`.env`、个人开发历史或内部工作日志。测试图片为生成素材，不是用户的真实照片。请勿提交任何私人数据、密钥、备份或带敏感内容的截图。

本仓库尚未为全部项目代码指定开源许可证；公开可见不等于获得任意再分发授权。各依赖和明确标注许可的测试素材遵循其自身许可证。装饰素材来源见 [主题素材说明](apps/web/public/themes/ASSETS.md)。
