# JMComic 阅读器 · BJTU MIS 插件

这是仓库内的 BJTU MIS Manifest v3 / `contract_v1` 静态插件源码，插件版本为 `2.0.3`。插件只使用匿名 JM API，以及宿主提供的运行时、受控网络、KV、Blob 和资源缓存能力；不读取 BJTU 身份、课表、凭据或其他校园数据。

## 2.0.3 更新

- 阅读返回、切换章节和阅读模式优先响应操作，进度与设置在后台保存；设置保存失败时回退并提示重试。
- 优先展示已缓存的漫画详情，返回发现页与搜索页时恢复浏览状态。
- 图片命中原生缓存后即可显示；临时预读限制为后续两页，离开阅读器时取消预读。
- 修复部分华为 WebView 中竖读占位图高度为零导致的整章加载和页码误跳，保持续读位置。
- 插件 ID、发布者、权限和数据 schema 不变，兼容现有收藏、进度与缓存。

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

模拟宿主只提供虚构元数据。正式网络、resource handle、固定缓存、生命周期和来源白名单必须在包含兼容二进制传输的 BJTU MIS Android WebView 中验证。现代 WebView 首选 ArrayBuffer；缺少该 feature 的 WebView 使用 48 KiB Base64URL 分片兼容模式。

## 官方工具链

本仓库 vendored SDK 固定来自 BJTU MIS 提交 `d7f43c446d4209cb99f6184b754a7c650f6a93d2`；来源与许可证见 `plugin/vendor/bjtu-mis-plugin-sdk/UPSTREAM.md`。使用该提交构建 `bjtu` CLI 后，可在仓库根目录直接运行：

```powershell
bjtu lint . --source
bjtu lint . --marketplace
bjtu test .
bjtu inspect .
bjtu doctor .
bjtu pack .
```

仓库跟踪的 Mock/HMR 配置位于 `plugin/bjtu-plugin.dev.json`。GitHub 高级导入会拒绝根目录中的开发配置，因此根目录不提交该文件。需要显式运行官方 `bjtu dev` 时，先执行 `npm run prepare:bjtu-dev` 生成被 Git 忽略的根配置；官方 `pack` 仍不会把它放入发行包。当前交付可提交 BJTU MIS 插件大厅，也可通过“高级 / 开发者导入”从 GitHub 仓库安装。

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
- 同一 publisher subject 与插件 ID 的更新保持稳定 sandbox origin，并由宿主保留 KV、Blob 与 Cache；`JMCR1` 元数据备份仍用于手动迁移和灾难恢复。
