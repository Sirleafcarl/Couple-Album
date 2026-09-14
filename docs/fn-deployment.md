# 飞牛部署：恋爱画廊

本次是全新安装，保留主题素材，不迁移本地测试照片、账号或相册。
这是部署操作说明，**不代表已在飞牛验证或上线**。backend、Web/Nginx、隔离安装和配套备份恢复已在开发电脑完成验证；飞牛设备、目录、端口和网络仍须安装时实测。

## 1. 准备条件

- 飞牛 Docker 支持 `docker compose`；终端中需有 Git、OpenSSL。以下命令在飞牛终端执行，不是在开发电脑上执行。
- 确认 `/vol1/1000/gallery` 属于机械硬盘，且 8088 端口未被其他应用占用。
- 不修改已有 Docker 应用。不要直接使用根目录的开发 `compose.yaml`。
- 先由开发端测试、提交并推送部署文件到 GitHub。本说明不会自动推送。

推荐目录：源码放 `/vol1/1000/gallery-source`；数据放 `/vol1/1000/gallery`。

```sh
git clone https://github.com/Sirleafcarl/Couple-Album.git /vol1/1000/gallery-source
cd /vol1/1000/gallery-source
mkdir -p /vol1/1000/gallery/media /vol1/1000/gallery/postgres /vol1/1000/gallery/backups
```

API/worker 使用容器内 UID 1000 运行。新建的 `media` 目录必须允许 UID 1000 写入；可由管理员对**这个新目录**执行 `chown 1000:1000 /vol1/1000/gallery/media`。不要递归更改整个存储空间权限，不要使用 chmod 777。Postgres 目录交给官方镜像初始化。

将 `deploy/.env.example` 复制到 `/vol1/1000/gallery/.env`（如已有该文件，不覆盖），仅授权本人读取：`chmod 600 /vol1/1000/gallery/.env`。在飞牛本地执行 `openssl rand -hex 32` 生成数据库密码，填入此文件的 `POSTGRES_PASSWORD`；不发送截图、不提交 GitHub。密码使用十六进制，避免数据库 URL 转义问题。数据库初始化后不要直接改密码环境变量，否则旧数据库密码不会随之改变。

示例访问地址 `http://192.168.1.100:8088`，请将环境文件中的 IP 替换为自己的飞牛局域网地址；本文目录也需按实际存储空间确认。如果改端口，必须同时修改 `GALLERY_PORT` 和 `APP_ORIGIN`。绑定 IP 是飞牛网口 IP；建议路由器做 DHCP 地址保留，避免 IP 改变。

## 2. 构建并首次启动

当前部署决定：不新增每批 200 张的上传限制，也不设置未经实测的 2 GiB 容器内存硬上限。前端保持逐张上传，图片 worker 并发为 1；这不保证超高像素单张图片的解码峰值很低。首次集中导入时，在另一个终端运行 `docker stats`，同时查看飞牛系统内存及其他应用的使用情况；内存紧张时先暂停继续添加上传，待队列消化后再继续。运行上限待实际导入数据后再确定，构建期间的占用需单独观察。

在源码根目录定义快捷函数（新终端需重新定义）：

```sh
dc() { docker compose --env-file /vol1/1000/gallery/.env -f compose.production.yaml "$@"; }
dc config --quiet
dc build
dc up -d
dc ps -a
dc logs --tail=60 migrate api worker
```

`config --quiet` 不打印密码。不要把完整 `docker compose config` 或容器环境截图发到公共平台。

首次构建要从网络下载 Node、Nginx、Postgres 镜像和 npm 包；构建比日常运行更占资源。后续可考虑 CI 预构建镜像，但本期不配置。

预期：migrate 以退出码 0 结束、API healthy，worker 和 web 运行。如果迁移或构建失败，先保留现场查看日志，不要删库重试。

## 3. 创建两个账号

```sh
dc exec api node apps/api/dist/users/create-user.js --email your-email@example.com --name 你的昵称
dc exec api node apps/api/dist/users/create-user.js --email partner-email@example.com --name 她的昵称
```

替换邮箱、昵称，密码交互输入，不出现在命令里。没有预置测试账号。
在局域网访问上述地址，测试登录、上传一张可丢弃图片、等待缩略图、创建相册、删除与恢复。再执行 `dc restart api worker web`，确认图片仍能查看。数据库和 media 目录不得删除。

HTTP 只用于可信家庭局域网初验；完整 PWA 安装/离线能力留待 HTTPS 阶段验证。不要做公网端口转发，不暴露数据库端口。女友异地访问需另配 HTTPS 和安全接入。

## 4. 更新前备份（暂停写入）

以下先提供可审查的手动步骤，不是一键更新脚本。停止 web/api/worker 防止上传或回收站清理与备份同时发生；Postgres 保持运行。

```sh
dc stop web api worker
umask 077
backup_dir=$(mktemp -d /vol1/1000/gallery/backups/snapshot-XXXXXXXX)
dc exec -T postgres pg_dump -U memory -d memory -Fc -f /tmp/gallery-backup.dump
dc cp postgres:/tmp/gallery-backup.dump "$backup_dir/database.dump"
cp -a /vol1/1000/gallery/media "$backup_dir/media"
git rev-parse HEAD
```

记录最后输出的旧提交号；另外安全保管外置 `.env`。确认上述每条命令成功后才继续；磁盘满或备份失败时不要迁移。`pg_dump` 使用容器内文件，避免失败的重定向被误认成成功备份。此媒体副本会占额外空间，同盘备份不防硬盘损坏，应另存一份到其他设备。

## 5. 安全更新顺序

1. `git status --short` 必须为空。记录旧提交号与当前 `dc images`，保留旧镜像用于故障恢复，不执行镜像清理。
2. `git pull --ff-only`：失败则停止，不 reset 或强行覆盖。GitHub 上没有 push 的提交不会拉到。
3. `dc build`：失败时旧运行容器仍可使用，不进入后续步骤。
4. 按第 4 节暂停写入并备份，备份必须成功。
5. `dc run --rm migrate`：失败就保持应用停止，查看错误，不自动回滚数据库。
6. `dc up -d --force-recreate migrate api worker web`，然后 `dc ps -a`，确认迁移退出 0、API healthy，实际登录查看照片。

数据库迁移是向前执行的。仅回退 Git 代码不保证兼容已迁移数据库；失败时需要根据日志判断继续修复或从完整备份恢复。禁止运行 `down -v`、删除数据库目录或清空照片目录“解决”问题。

## 6. 恢复演练原则

**先恢复到独立空目录和独立 Compose 项目，绝不覆盖当前数据。**

1. 新建另一个数据根目录，复制备份中的 media 到新目录，设置相同 UID 1000 写权限。
2. 创建独立的环境文件，修改 `GALLERY_ROOT` 和 Web 端口及 `APP_ORIGIN`。使用 `docker compose -p love-gallery-restore --env-file <恢复环境文件> -f compose.production.yaml ...`，与正式项目完全分离。
3. 使用记录的旧代码版本与对应镜像，仅启动恢复项目的 postgres：`up -d postgres`，等待 healthy。
4. 将备份复制进去：`cp <备份/database.dump> postgres:/tmp/restore.dump`（此处 cp 是上面的 **docker compose 子命令**），执行 `exec -T postgres pg_restore -U memory -d memory --exit-on-error /tmp/restore.dump`。仅允许目标是独立空数据库，不用 `--clean` 覆盖已有数据。
5. 恢复成功后再启动应用，核对账号、相册、原图、预览和回收站。验证通过之前不要切换正式入口或删除旧数据。

同版本恢复成功不代表所有跨版本降级安全；升级后的数据若回退到旧备份，备份之后的新增内容不会自动保留。

## 验证记录

撤下童话城堡主题后的本地部署复核：339 项默认测试通过、3 项 opt-in 测试跳过；全工作区类型检查和构建通过；5 项部署配置测试通过。正式 backend/Web 镜像重新构建成功，镜像内合成图片生成预览与缩略图、迁移入口存在及 Nginx 配置检查通过。本轮未重跑完整浏览器安装/备份恢复流程，先前隔离演练记录如下。当前保留原有 PinkRoom 大于 500 kB 的构建提示，不影响构建成功。

实现期间的实际测试结果记录在部署实施计划中。2026-09-14 已在 Linux/aarch64 Docker Desktop 上通过正式 Web 镜像构建、Nginx 反代、交互建号、浏览器登录、上传处理、容器隔离启动以及数据库和三种媒体的配套恢复演练。测试使用临时目录和一次性凭据，未连接本地开发数据库或飞牛。

飞牛目录权限、实际 CPU/Compose 兼容性、网络下载、端口占用及设备实测，仍需安装时确认；只有飞牛上完成登录、上传、重启保留和局域网访问后，才能称为部署完成。HTTPS、异地访问与手机 PWA 实机验证属于后续阶段。

Compose 依赖门禁参考：[Docker 官方启动顺序说明](https://docs.docker.com/compose/how-tos/startup-order/)。
