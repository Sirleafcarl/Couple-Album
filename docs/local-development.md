# 本地开发指南

这份指南用于在开发电脑上运行双人私人照片库。应用保留原图，并由独立 Worker 生成预览图和缩略图；数据库只保存元数据与相对文件路径。

## 原图与处理进程必须共享同一目录

API 与 Worker 的 `DATA_ROOT` 现在统一相对于项目根目录解析；默认 `./data` 指向根目录的 `data/`，不受各服务启动目录影响。绝对路径保持不变，容器部署继续使用双方共同挂载的绝对路径。

已有原图的安装不要直接切换到空目录。请在未纳入 Git 的 `.env` 中，将 `DATA_ROOT` 指向你现有的原图数据根目录，确保 API/Worker 共用。迁移服务器时需要一起迁移该目录和数据库，再更新 `DATA_ROOT`。修改环境配置后重启 API 与 Worker。

若照片长期“正在处理”，检查任务的 `last_error` 和两个服务实际存储根路径。达到最大重试次数的失败任务不会自动恢复，需要在确认原图完整及故障已修复后有针对性地重试，不能通过删除照片来解决。

## 前置条件

- Node.js 24 或更高版本
- pnpm 11.8.0（项目已通过 `packageManager` 固定版本）
- Docker Desktop 或兼容的 Docker Compose
- Playwright Chromium：首次验收前运行 `pnpm exec playwright install chromium`

## 第一次启动

在项目根目录执行：

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm --filter @memory/db db:migrate
DATABASE_URL=postgres://memory:memory@localhost:38427/memory_test pnpm --filter @memory/db db:migrate
```

PostgreSQL 包含两个互相隔离的数据库：

- `memory`：本地开发数据和两位固定账号。
- `memory_test`：集成、性能、恢复和浏览器测试使用，可以随时清空。

迁移会同时创建共享相册和年度主题设置。相册名称、故事、发生日期、创建者与版本保存在 PostgreSQL；刷新页面或重启服务后不会丢失。

如果旧数据卷没有 `memory_test`，补建并迁移：

```bash
docker compose exec postgres createdb -U memory memory_test
DATABASE_URL=postgres://memory:memory@localhost:38427/memory_test pnpm --filter @memory/db db:migrate
```

## 创建两位固定账号

命令会分别询问两次密码，输入显示为星号，密码不会出现在命令历史中：

```bash
pnpm --filter @memory/api user:create -- --email first@example.com --name First
pnpm --filter @memory/api user:create -- --email second@example.com --name Second
```

系统只允许两位有效用户，第三次创建会失败。网站没有公开注册入口。

## 启动方式

日常开发推荐只让 Docker 提供 PostgreSQL，再在宿主机运行三个开发进程：

```bash
pnpm db:up
pnpm dev
```

`pnpm dev` 同时启动 API、Web 和图片 Worker。打开 <http://localhost:5173>；Web 会把 `/api` 代理到 `127.0.0.1:23001`。

首页顶部的相伴计时器读取 `.env` 中的 `VITE_RELATIONSHIP_STARTED_AT`。请使用带时区的 ISO 时间，例如：

```dotenv
VITE_RELATIONSHIP_STARTED_AT=2024-05-20T18:30:00+08:00
```

修改后重启 Web 开发进程。未配置、日期无效或在未来时，首页显示配置提示，不再使用虚构的纪念日计时。音乐未接入前只显示说明，不模拟播放成功。

### 新版导航和相册廊

正式入口是 <http://localhost:5173>。电脑使用左侧导航，平板收成图标栏，手机使用导航抽屉；支持 Escape 关闭和焦点返回。照片库、上传和相册内页共用此导航。

相册横向延伸。内容没有超出可见区域时不自动漫游；超出后可自动向右推进，交互时暂停，闲置 5 秒后恢复；弹窗打开、后台和减少动态效果下不自动运动。到尾端停下。

目前包含 11 套现代主题首版和 3 套经典主题，可保存年度选择。公开版「神圣快乐」使用天空占位素材。主题视觉精修、独立外观组合、超长相册廊虚拟化及位置恢复仍有后续工作。

## 共同维护相册

登录后首页直接打开相册廊。两位固定账号看到同一组相册，并且都可以：

- 新建相册，发生日期会自动决定所属年份和月份；
- 编辑任意相册，即使它由另一位账号创建；
- 将相册改到另一个年份；
- 切换并保存某一年的共同主题。

编辑采用版本校验。如果双方恰好同时修改同一本相册，后提交的一方会保留自己的草稿，并可明确选择“载入最新内容”，不会静默覆盖对方刚保存的版本。

## 真实上传与相册照片墙

正式入口是 <http://localhost:5173/>。

1. 在相册廊新建相册，点击相册，再点击“进入相册”。
2. 点击“添加照片”：可以从本地上传，也可以从双方照片库挑选已有照片。
3. 本地上传先保存到当前账号的个人照片库，再加入目标相册。上传中心也可直接选择目标相册；两位账号都能选择任意相册。
4. 点击“故事书 / 花园 / 胶片”保存此相册的布局。点击“整理”，用向前、向后调整共同顺序，或从相册移除照片。
5. 刷新后，成员关系、布局和顺序仍然保留。相册廊自动使用相册内第一张可用照片作为封面。

两位用户可以添加、排序和移除任意相册里的照片引用，照片所有者不会改变。移除引用不删除个人照片库中的原图，也不影响其他相册。同一个照片 ID 在同一本相册中只出现一次。

上传中心和相册中的上传队列使用真实结果，没有预设成功/失败数据。重复照片可以跳过或明确保留副本；选择了目标相册时，也可以“使用已有照片”。如果显示“原图已保存，加入相册失败”，点击“重试加入相册”只重试关联，不会再次上传原图。上传期间请留在当前页面；刷新或离开后可从照片库找到已保存的原图并重新加入相册，未开始的本地队列尚不跨页面保留。

相册每次读取 40 张，可点击“继续看照片”。花园保留照片比例；故事书和胶片按需读取高清预览，只有点击下载原图时才获取原文件。初始顺序以加入时已知的拍摄时间排序，尚无拍摄时间则使用加入时间；初始排序键固定，避免后台提取拍摄信息时照片跨页跳动。手动排序后，新加入照片排在末尾。双方同时操作造成版本冲突时会要求刷新，不静默覆盖对方的顺序。

已验证 200 条照片记录在三种布局、电脑/平板/手机视口下分批浏览；测试复用合成测试图片，不代表数万张不同大原图的性能验收。

相册音乐、个人照片二级删除、相册三级删除和 30 天回收站仍待正式接入。当前“从相册移除”仅操作引用，不能代替删除原图或删除相册。

也可以完全通过容器运行本地整套服务：

```bash
docker compose up -d
docker compose ps
```

Compose 会依次启动 PostgreSQL、迁移、API、Worker 和 Web。修改源码后需要重建运行容器内的临时代码副本：

```bash
docker compose up -d --force-recreate api worker web
```

## 照片与数据位置

默认数据根目录是项目下的 `data/`，不进入 Git：

```text
data/
├── originals/     # 永久保留的原图
├── previews/      # 浏览预览图
├── thumbnails/    # 照片库缩略图
└── staging/       # 上传过程的临时文件
```

可在 `.env` 中设置绝对路径，例如飞牛机械盘上的 `DATA_ROOT=/srv/memory-data`。数据库只保存上述根目录内的相对路径，API 响应不会暴露宿主机路径。

当前支持 JPEG、PNG、WebP、HEIC/HEIF。默认单文件上限为 100 MiB（`MAX_UPLOAD_BYTES=104857600`），并预留至少 1 GiB 空闲空间（`MIN_FREE_BYTES=1073741824`）。修改限制后需同时重启 API；Worker 使用同一数据根。

上传成功只代表原图已安全提交并进入处理队列。照片显示“正在处理”时原图仍可读取；显示“处理失败”时可在上传中心看到面向用户的原因。原图不会因衍生图失败而删除。Worker 重启会自动回收超过 `STALE_JOB_MS` 的任务锁并重试。

## 运行检查

常规检查：

```bash
pnpm typecheck
pnpm test
pnpm build
```

10,000 条合成元数据的索引与深游标性能测试默认跳过，手动运行：

```bash
RUN_PERFORMANCE_TESTS=true pnpm --filter @memory/db exec vitest run test/photo-library-performance.test.ts
```

测试在 `memory_test` 中临时写入并清理数据；本地阈值为首屏和深游标页各 500ms，并要求 PostgreSQL 使用活动照片游标索引。

Worker 崩溃恢复测试使用 `memory_test` 和系统临时目录，结束后自动清理：

```bash
pnpm --filter @memory/worker test:restart
```

## 浏览器验收与完整门禁

验收测试会清空且只清空 `memory_test`，并使用 `test-results/e2e-data` 作为临时照片根目录。请使用测试账号信息，不要填写真实账号密码：

```bash
export E2E_USER_EMAIL=first@example.com
export E2E_PARTNER_EMAIL=second@example.com
read -s E2E_USER_PASSWORD
export E2E_USER_PASSWORD
read -s E2E_PARTNER_PASSWORD
export E2E_PARTNER_PASSWORD
pnpm test:e2e
```

`pnpm test:e2e` 自动迁移并初始化测试库，启动 API、Worker 和 Web，完成后删除精确的测试照片目录。完整门禁包含类型检查、全部常规测试、生产构建、浏览器验收和 Worker 恢复：

浏览器验收默认使用独立的 `24001`（API）和 `25173`（Web）端口，避免与正在运行的开发页面冲突；如仍有占用，可通过 `E2E_API_PORT` 和 `E2E_WEB_PORT` 覆盖。

```bash
pnpm verify
```

## 测试用设计素材

公开版本未包含独立设计预览应用，只保留浏览器测试需要的四张生成图片。来源见 [素材说明](design-preview/ASSETS.md)。这些图片不会自动加入真实用户的相册。

## 停止服务

宿主机开发模式下，在运行 `pnpm dev` 的终端按 `Ctrl+C`，再停止 PostgreSQL：

```bash
pnpm db:down
```

全容器模式使用：

```bash
docker compose down
```

以上命令都不会删除 PostgreSQL 数据卷。不要使用 `docker compose down -v`，除非明确要永久删除数据库。

## 只重置本地开发数据库

以下命令会永久删除 `memory` 中的开发账号与数据，不会删除 `memory_test` 或 `data/`。执行前先停止 API：

```bash
docker compose exec postgres dropdb -U memory --if-exists memory
docker compose exec postgres createdb -U memory memory
pnpm --filter @memory/db db:migrate
```

随后重新创建两位账号。

## 确认私有数据没有进入 Git

```bash
git check-ignore -v .env data backups test-results
git status --short
```

`.env`、`data/`、`backups/` 和 `test-results/` 必须被忽略。不要提交真实密码、照片、音乐、数据库文件或备份。
