# Cloudflare Pages 部署

静态游戏由 Pages 提供，`functions/api/scores.js` 在同源 `/api/scores` 处理全服排行榜，数据保存在 D1。前端接口路径、浏览器本地存档和设置不变。`ops/deploy/serve.py` / `update.py` 仅供原服务器使用，Cloudflare 不运行这些 Python 进程。

## 当前配置

- Pages 项目：`adonis-game`（实际生产地址以 Cloudflare 部署输出为准）。
- GitHub：`imxv/Adonis`，生产分支 `main`。
- 构建命令：`npm run build`；输出目录：`dist`；项目根目录：仓库根目录。
- Node.js：22（至少 22.12）；依赖安装使用公共 npm 源。
- D1 数据库：`adonis-scores`，绑定名 `DB`，迁移文件在 `migrations/`。
- `wrangler.jsonc` 是 Pages Functions 和 D1 绑定的配置来源。数据库 UUID 不是密钥；不要提交 API token 或 `.dev.vars`。

## 首次创建或恢复部署

以下命令在仓库根目录执行，需要 Node.js 和 Wrangler（本次使用 4.77.0）。

```sh
npm ci --registry=https://registry.npmjs.org
npm run build
wrangler login
wrangler d1 create adonis-scores --location apac
```

已经有数据库时跳过创建，使用 `wrangler d1 list` 确认，并将真实 `database_id` 写入 `wrangler.jsonc`。应用迁移：

```sh
wrangler d1 migrations apply adonis-scores --remote
```

在 Cloudflare 的 Workers & Pages 中创建 **Pages → Connect to Git** 项目，选择 `imxv/Adonis`，按上面的构建参数配置。若首次部署时 `main` 尚未合入 Functions 和 D1 配置，先关闭自动生产部署；待适配代码合入后再开启，避免未适配的静态构建覆盖完整站点。

已有 Git 集成项目也可以用 Wrangler 立即发布当前本地构建：

```sh
wrangler pages deploy dist --project-name adonis-game --branch main
```

不要为同一个站点另建 Direct Upload 项目：该类型不能事后切换成 Git 集成。正常启用 Git 自动部署后，后续推送 `main` 会构建并发布。新增数据库迁移时，在发布依赖新表结构的代码前先应用对应远端迁移。

## 本地验收

本地 D1 与生产数据库分开。先初始化本地表，再运行 Pages：

```sh
npm ci --registry=https://registry.npmjs.org
npm run build
wrangler d1 migrations apply adonis-scores --local
wrangler pages dev dist --port 8788
```

另一个终端执行：

```sh
node tools/test-cloudflare-scores.mjs
```

该集成脚本只允许 localhost，执行时会重置**本地** D1 测试数据，覆盖真实 Function + D1 的请求校验、流式请求体大小、UTF-8、字段过滤、同源 API、并发冷却、同分排序、前 50 / 保留 500 条、累计次数和第 501 名。脚本结束再次清空本地测试数据，不接触远端数据库，也没有 UI 单元测试。

## 上线后检查

- 浏览器打开生产地址，确认大厅、进入游戏和静态资源正常加载。
- `GET /api/scores` 应返回 JSON `{ "top": [], "runs": 0, "best": 0 }`（已有成绩时相应变化），而不是 HTML。
- 用一次完整成绩提交验证 `POST /api/scores`，随后 GET 读回；8 秒内重复提交应返回 429。生产验收数据应使用单独 QA 标识，清理时仅删除对应记录并修正该次测试计数。
- 排行榜响应不公开 `pid`、内部行 ID 或客户端 IP。冷却依据 Cloudflare 提供的 `CF-Connecting-IP`，D1 只保存其 SHA-256 摘要，过期冷却项在后续提交中清理。
- D1 一次批处理事务完成冷却、写入、计数、排名和裁剪，避免并发请求突破冷却或丢失累计次数。

新建 D1 默认是空榜；旧 Python 服务中的 JSON 成绩不会自动搬迁。需要保留旧全服记录时，先备份并单独导入，避免覆盖已产生的新成绩。旧域名与新 Pages 域名的浏览器本地存档也互相独立。

参考：[Pages Git 集成](https://developers.cloudflare.com/pages/get-started/git-integration/)、[Pages Wrangler 配置](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)、[D1 批处理事务](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)。
