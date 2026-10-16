# GitHub main 自动部署

第 5 组预览地址：<https://tianmu-hackathon-group-05.test.gifshow.com/>。入口需要公司 SSO 登录。

开发机每 60 秒检查 `https://github.com/imxv/Adonis.git` 的 `main` 分支。只有推到 GitHub 的提交会发布，本机未提交的内容不会参与部署。先在本地构建和试玩，确认后再推送 `main`。

更新进程拉取固定 commit，在独立目录运行 `npm ci --no-audit --no-fund` 和 `npm run build`。构建和文件检查通过后，原子切换 `adonis-current` 链接，再通过本机 HTTP 读取版本信息和首页。失败会保留或恢复上一版，并记录错误；同一失败提交 5 分钟后重试，新提交无需等旧提交的退避时间。

网页服务不因普通发布而重启。入口和版本信息不缓存，哈希资源可缓存；保留版本中的旧资源可回退读取，减少发布切换时旧页面资源 404。默认保留最近 5 个自动发布版本以及仍需使用的版本。已有手动发布目录不自动删除。

这套进程由开发机上的 supervisord 管理，不依赖本机 Codex 或电脑保持开启。开发机必须保持运行，且能访问 GitHub 和锁文件中的快手 npm 源；开发机被回收后需要重新安装。

## 文件与目录

| 文件/目录 | 用途 |
| --- | --- |
| `/root/project/adonis-deploy/update.py` | 自动发布、状态和回滚命令 |
| `/root/project/adonis-deploy/serve.py` | 监听 `0.0.0.0:8000` 的静态服务 |
| `/root/project/adonis-deploy/config.json` | 仓库、分支、检查间隔、路径 |
| `/root/project/adonis-deploy/status.json` | 最近检查、发布或失败的状态 |
| `/root/project/adonis-releases/` | 各版本源码、构建产物 |
| `/root/project/adonis-current` | 当前 `dist/` 的软链接 |
| `/tmp/adonis-updater.log`、`/tmp/adonis-updater.err` | 自动更新日志，配置了轮转 |

网页中的 `/deployment.json` 记录实际发布的 GitHub commit。构建检查和 HTTP 健康检查不代替游戏玩法验收。

## 运维命令

下面命令在开发机上执行；本机可以通过 `hackathon exec --command '<命令>'` 调用，并固定设置 `HACKATHON_CLI_STATE_DIR="$HOME/.hackathon-cli-state"`。

```bash
# 查看两个服务
supervisorctl status adonis-web adonis-updater

# 查看当前版本、自动更新状态
/root/anaconda3/bin/python3 /root/project/adonis-deploy/update.py --config /root/project/adonis-deploy/config.json status

# 暂停 / 恢复自动发布
/root/anaconda3/bin/python3 /root/project/adonis-deploy/update.py --config /root/project/adonis-deploy/config.json pause
/root/anaconda3/bin/python3 /root/project/adonis-deploy/update.py --config /root/project/adonis-deploy/config.json resume

# 回退到上一成功版本，同时暂停自动发布
/root/anaconda3/bin/python3 /root/project/adonis-deploy/update.py --config /root/project/adonis-deploy/config.json rollback

# 回退到保留目录中的指定 GitHub commit，同时暂停自动发布
/root/anaconda3/bin/python3 /root/project/adonis-deploy/update.py --config /root/project/adonis-deploy/config.json rollback --commit <完整commit>
```

回滚后先排查原因，修复并推送 `main`，然后执行 `resume`。如果回滚时恰好正在构建，命令会先暂停后续发布；等该次构建结束，再执行一次回滚。不需要调整 GitLab MR 或分支。

## 首次安装 / 维护部署脚本

1. 确认开发机处于 ready，`/root/project/adonis-current/index.html` 可用（链接直接指向 `dist/`），8000 端口用于本应用。
2. 将 `update.py`、`serve.py`、`config.json` 写入 `/root/project/adonis-deploy/`。目录中已有状态文件时保留。
3. 备份已有的同名 supervisor 配置，再将两个 `.conf` 写入 `/etc/supervisor/conf.d/`。
4. 用 `supervisorctl reread` 和 `supervisorctl update adonis-web adonis-updater` 仅更新这两个进程。
5. 检查服务状态、`/deployment.json` 与浏览器中的真实页面。

自动更新仅负责应用版本。修改本目录下部署器本身后，需要按上述维护步骤更新开发机上的脚本，并定向重启对应进程。

## 检查部署器

```bash
python3 -m unittest discover -s ops/deploy -p 'test_*.py'
```

这些检查覆盖部署事务和静态 HTTP 服务，不包含 UI 单元测试。
