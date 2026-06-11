# 图标代理基线验证

日期：2026-06-11T09:07:00Z

## 验证命令

本地服务：

```bash
PORT=3100 node backend/server.js
```

检查 PWA 静态资源和图标代理：

```bash
curl -sS -o /tmp/out -w 'HTTP=%{http_code} CT=%{content_type} SIZE=%{size_download}\n' http://127.0.0.1:3100/manifest.webmanifest
curl -sS -o /tmp/out -w 'HTTP=%{http_code} CT=%{content_type} SIZE=%{size_download}\n' http://127.0.0.1:3100/service-worker.js
curl -sS -o /tmp/out -w 'HTTP=%{http_code} CT=%{content_type} SIZE=%{size_download}\n' 'http://127.0.0.1:3100/api/proxy-icon?url=https%3A%2F%2Ficon.horse%2Ficon%2Fexample.com'
curl -sS -o /tmp/out -w 'HTTP=%{http_code} CT=%{content_type} SIZE=%{size_download}\n' 'http://127.0.0.1:3100/api/icon/proxy?url=https%3A%2F%2Ficon.horse%2Ficon%2Fexample.com'
```

## 结果

PWA 资源：

```text
/manifest.webmanifest  HTTP=200 CT=application/manifest+json SIZE=520
/service-worker.js     HTTP=200 CT=application/javascript; charset=UTF-8 SIZE=2739
/assets/icon-192.png   HTTP=200 CT=image/png SIZE=1077
/assets/icon-512.png   HTTP=200 CT=image/png SIZE=4045
```

图标代理：

```text
/api/proxy-icon?url=https%3A%2F%2Ficon.horse%2Ficon%2Fexample.com
HTTP=200 CT=image/png SIZE=1101

/api/icon/proxy?url=https%3A%2F%2Ficon.horse%2Ficon%2Fexample.com
HTTP=200 CT=image/png SIZE=1101
```

`POST /api/favicon`：

```text
HTTP=200 CT=application/json; charset=utf-8
返回 success=true，包含 google-fallback、favicon.im、icon.horse 等候选。
```

## 发现并已修复

旧路径 `/api/icon/proxy` 在修复前会落到 SPA fallback，返回 `text/html` 首页。已补充兼容路由：

```js
router.get('/proxy-icon', proxyIconHandler);
router.get('/icon/proxy', proxyIconHandler);
```

并新增测试 `tests/icon-proxy-routes.test.js` 锁定该行为。
