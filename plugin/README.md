# JMComic 阅读器 · BJTU MIS 插件

这是仓库内的 BJTU MIS schema v2 静态插件源码。插件只使用匿名 JM API，不读取 BJTU 身份、课表、凭据或其他校园数据。

## 本地开发

```powershell
cd plugin
npm ci
npm test
npm run build
```

Vite 会把可安装产物写到仓库根目录 `dist/`。请同时提交源码、锁文件与构建产物；Python wheel/sdist 始终写入根目录 `python-dist/`。

普通浏览器没有 `window.BjtuService`。界面开发可使用：

```text
http://localhost:5173/?mock=1#/discover
```

模拟桥只提供虚构元数据；正式联网、缓存和来源白名单必须在 BJTU MIS Android WebView 中验证。

## 发布前检查

```powershell
npm test
npm run build
npm run check:dist
npm run check:package
```

CI 会从 BJTU MIS Android 的固定提交 `6e54b2a8988fc0b199253735ce232b4c36e0df3d` 运行 manifest schema 与官方 lint。

## 范围与免责声明

- 仅面向年满 18 周岁的用户，首次启动必须确认年龄。
- 本项目与 JMComic 及 BJTU MIS 官方均无隶属关系。
- 用户应遵守所在地法律、内容版权与上游站点规则。
- 插件不包含登录、云收藏、评论、遥测、代理后端或系统下载目录导出。
- 插件更新会改变 WebView sandbox origin；离线图片不能跨版本迁移，只有剪贴板中的 `JMCR1` 元数据备份可以恢复。
