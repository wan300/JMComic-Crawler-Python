# JMComic 阅读器 · BJTU MIS 插件

这是仓库内的 BJTU MIS Manifest v3 / `contract_v1` 静态插件源码，插件版本为 `2.0.0`。插件只使用匿名 JM API，以及宿主提供的运行时、受控网络、KV、Blob 和资源缓存能力；不读取 BJTU 身份、课表、凭据或其他校园数据。

## 本地开发

npm 工程入口位于仓库根目录，源码和测试保留在 `plugin/`：

```powershell
npm ci
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Vite 会把可安装产物写到仓库根目录 `dist/`。请同时提交源码、根锁文件与构建产物；Python wheel/sdist 始终写入根目录 `python-dist/`。

普通浏览器可使用只在 `?mock=1` 时动态加载的 v3 Mock Host：

```text
http://localhost:5173/?mock=1#/discover
```

模拟宿主只提供虚构元数据。正式网络、resource handle、固定缓存、生命周期和来源白名单必须在 BJTU MIS 1.4.0 Android WebView 中验证。

## 官方工具链

本仓库 vendored SDK 固定来自 BJTU MIS 提交 `06f2b03a4cda4ad1b9d19fea01e8065808659044`；来源与许可证见 `plugin/vendor/bjtu-mis-plugin-sdk/UPSTREAM.md`。使用该提交构建 `bjtu` CLI 后，可在仓库根目录直接运行：

```powershell
bjtu lint . --source
bjtu lint . --marketplace
bjtu test .
bjtu inspect .
bjtu doctor .
bjtu pack .
```

`bjtu-plugin.dev.json` 仅用于 Mock/HMR，官方 `pack` 不会把它放入发行包。当前交付仅供 BJTU MIS“高级 / 开发者导入”，不提交插件大厅。

## 发布前检查

```powershell
npm ci
npm test
npm run typecheck
npm run build
npm run check:dist
npm run check:package
python -m build --outdir python-dist
```

CI 会检出固定宿主 SHA，构建官方 CLI，执行 source/marketplace lint、浏览器协议烟测、inspect、doctor 和两次确定性 pack。

## 范围与免责声明

- 仅面向年满 18 周岁的用户，首次启动必须确认年龄。
- 本项目与 JMComic 及 BJTU MIS 官方均无隶属关系。
- 用户应遵守所在地法律、内容版权与上游站点规则。
- 插件不包含登录、云收藏、评论、遥测、代理后端或系统下载目录导出。
- v3 `data_schema_version` 从 1 开始，不兼容旧 v1/v2 IndexedDB 数据。
- 插件更新会改变 WebView sandbox origin；离线图片不能跨版本迁移，只有复制出的 `JMCR1` 元数据备份可以恢复。
