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

## 玩家身份与 GitHub 登录

进入游戏时，画廊上会先弹出身份选择：用 GitHub 登录，或者填一个名字以游客身份进入。之后画廊右上角的名牌可以改名、登录或退出。

- **游客**：浏览器本地随机生成的 ID 加上玩家填的名字（`localStorage`），不经服务器验证，换浏览器或清缓存就是新的游客。
- **GitHub**：走 GitHub OAuth App。`functions/api/auth/github/login.js` 跳转到 GitHub 授权页（不申请任何 scope，只读公开资料），`callback.js` 用授权码换 access token、读一次 `/user`，随后丢弃 token。登录状态是一个 30 天的 HttpOnly Cookie，D1 的 `sessions` 表只存它的 SHA-256。登录时会把这个浏览器之前的游客成绩并入 GitHub 账号。
- **排行榜**：每局都记在一个玩家名下（`github:<GitHub 用户 ID>` 或 `guest:<浏览器 ID>`），`scores` 表保留所有局，`board` 表记录每位玩家的最好一局。全服榜每人只占一行，GitHub 玩家名字后面带 `GH` 标记。已登录时，服务器按 Cookie 认人，忽略请求里的名字和浏览器 ID。
- 没配置 GitHub 登录、连不上接口（本地 `npm run dev`、原 Python 服务）时，身份选择里只有游客可用，游戏照常运行。

### 开通 GitHub 登录（一次性）

密钥只填在 GitHub 和 Cloudflare 后台，不要提交到仓库，也不要发到聊天里。

1. 打开 GitHub → 右上角头像 → **Settings** → 左栏最底部 **Developer settings** → **OAuth Apps** → **New OAuth App**（也可以直接打开 <https://github.com/settings/applications/new>）。
2. 按下面填写后点 **Register application**：
   - Application name：`Adonis 画中轮回`（玩家在授权页看到的名字）
   - Homepage URL：`https://adonis-game.pages.dev`
   - Authorization callback URL：`https://adonis-game.pages.dev/api/auth/github/callback`
   - 不勾选 Enable Device Flow。
3. 在应用页面复制 **Client ID**，再点 **Generate a new client secret**，复制生成的 secret（只显示一次）。
4. 打开 Cloudflare 控制台 → **Workers & Pages** → `adonis-game` → **Settings** → **Variables and Secrets** → **Add**，添加两项，类型都选 **Secret**（加密）：
   - `GITHUB_CLIENT_ID`：上一步的 Client ID
   - `GITHUB_CLIENT_SECRET`：上一步的 client secret

   也可以用命令行：`wrangler pages secret put GITHUB_CLIENT_ID --project-name adonis-game`，回车后粘贴值；`GITHUB_CLIENT_SECRET` 同理。
5. 在部署新代码之前，先给线上数据库加表：`wrangler d1 migrations apply adonis-scores --remote`（会应用 `migrations/0002_players.sql`；旧成绩会按浏览器 ID 归到各自的游客名下）。
6. 重新部署一次（推送 `main`，或在 Pages 的 **Deployments** 里对最新部署点 **Retry deployment**），新加的 secret 才会生效。
7. 打开 `https://adonis-game.pages.dev`，身份选择里的「用 GitHub 登录」应该可以点；登录后画廊右上角显示 `GitHub · 你的用户名`。`/api/auth/me` 返回 `{"player": {...}, "github": true}`。

GitHub OAuth App 只认一个回调地址，所以只有填写的那个域名能登录。以后绑定自己的域名时，把 Homepage URL 和回调地址改成新域名即可；Pages 的预览地址（`*.adonis-game.pages.dev`）上 GitHub 登录不可用，游客照常。

### 本地调试 GitHub 登录

另建一个只用于本地的 OAuth App，回调地址填 `http://localhost:8788/api/auth/github/callback`，然后在仓库根目录建 `.dev.vars`（已在 `.gitignore` 中）：

```sh
GITHUB_CLIENT_ID="本地 OAuth App 的 Client ID"
GITHUB_CLIENT_SECRET="本地 OAuth App 的 secret"
```

再按下面「本地验收」用 `wrangler pages dev dist --port 8788` 启动即可。

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

登录相关的逻辑另有一个不需要 Wrangler 的单元测试：直接在 Node 里调用这些 Function，D1 换成按 `migrations/` 建表的内存 SQLite（`node:sqlite`，Node 22.13+），GitHub 换成假的 `fetch`。覆盖未配置时的回退、OAuth state 校验、拒绝授权和错误授权码、token 不落库、会话过期和退出、游客成绩并入 GitHub 账号、已登录时无法冒名提交、每人一行的排行榜：

```sh
node tools/test-cloudflare-auth.mjs
```

该集成脚本只允许 localhost，执行时会重置**本地** D1 测试数据，覆盖真实 Function + D1 的请求校验、流式请求体大小、UTF-8、字段过滤、同源 API、并发冷却、同分排序、每人一行、前 50、累计次数和第 501 名。脚本结束再次清空本地测试数据，不接触远端数据库，也没有 UI 单元测试。

## 上线后检查

- 浏览器打开生产地址，确认大厅、进入游戏和静态资源正常加载。
- `GET /api/scores` 应返回 JSON `{ "top": [], "runs": 0, "players": 0, "best": 0 }`（已有成绩时相应变化），而不是 HTML；`GET /api/auth/me` 应返回 `{ "player": null, "github": true }`（未配置 GitHub 登录时 `github` 为 `false`）。
- 用一次完整成绩提交验证 `POST /api/scores`，随后 GET 读回；8 秒内重复提交应返回 429。生产验收数据应使用单独 QA 标识，清理时仅删除对应记录并修正该次测试计数。
- 排行榜响应不公开 `pid`、玩家内部 ID、行 ID 或客户端 IP。冷却依据 Cloudflare 提供的 `CF-Connecting-IP`，D1 只保存其 SHA-256 摘要，过期冷却项在后续提交中清理。
- D1 一次批处理事务完成冷却、写入、更新该玩家的最好成绩、计数和排名，避免并发请求突破冷却或丢失累计次数。每局成绩都保留在 `scores` 表里供以后统计，读榜只读 `board` 表的前 50 行。

新建 D1 默认是空榜；旧 Python 服务中的 JSON 成绩不会自动搬迁。需要保留旧全服记录时，先备份并单独导入，避免覆盖已产生的新成绩。旧域名与新 Pages 域名的浏览器本地存档也互相独立。

参考：[Pages Git 集成](https://developers.cloudflare.com/pages/get-started/git-integration/)、[Pages Wrangler 配置](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)、[D1 批处理事务](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)。
