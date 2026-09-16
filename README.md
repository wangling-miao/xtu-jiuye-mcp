# 湘潭大学就业信息网 MCP

Cloudflare Worker 上的远程 MCP，用于检索湘潭大学就业信息网。

## 这版搜索和前面几个站点不一样

就业网目前不是 Visual SiteBuilder 的 `search.jsp` HTML 搜索，而是调用云就业接口：

```text
https://dc.bysjy.com.cn/search/provider_new
```

学校公开 token：

```text
yxqqnn0000000005
```

浏览器搜索时会发 **两次请求**：

1. `is_total=1&start=0&count=0`：先查询命中总数
2. `start_page=1&start=1&count=10`：再查询当前页结果

返回也不是纯 JSON，而是：

```js
var __result = {"code":1,"msg":"","data":[...]};
```

本项目已经按这个流程实现，并兼容直接 JSON / `__result = ...`。

## 工具

| 工具 | 作用 |
|---|---|
| `search_jiuye` | 搜索就业网，自动“先总数、后分页数据” |
| `get_detail` | 读取就业网公开详情页 |
| `list_sections` | 常用栏目与搜索类型 |

### search_jiuye 参数

- `query`：关键词
- `page`：页码，默认 1
- `page_size`：默认 10，最大 50
- `type`：
  - `""` 全部
  - `1` 双选会
  - `2` 双选会参会单位
  - `3` 宣讲会
  - `4` 在线招聘
  - `5` 职位
  - `6` 通知公告

已实测你提供的“华为”结果中 `type=6` 是通知公告/新闻，对应：

```text
https://jiuye.xtu.edu.cn/detail/news?id=<id>
```

另外就业网公开详情路径当前可见：

- 双选会：`/detail/jobfair?id=...`
- 宣讲会：`/detail/career?id=...`
- 在线招聘：`/detail/online?id=...`
- 职位：`/detail/job?id=...`
- 通知公告：`/detail/news?id=...`

双选会参会单位 `type=2` 暂不强行拼接详情地址，避免猜错。

## 部署

```bash
npm i
npx wrangler login
npx wrangler deploy
```

## MCP 地址

```text
https://xtu-jiuye-mcp.<你的账号>.workers.dev/1725d2a2-4a65-4608-a623-20667e1cae3f/mcp
```

## 客户端配置

```json
{
  "mcpServers": {
    "xtu-jiuye": {
      "type": "http",
      "url": "https://xtu-jiuye-mcp.<你的账号>.workers.dev/1725d2a2-4a65-4608-a623-20667e1cae3f/mcp"
    }
  }
}
```

## 自测

```bash
UUID=1725d2a2-4a65-4608-a623-20667e1cae3f
BASE=https://xtu-jiuye-mcp.<你的账号>.workers.dev

curl -s "$BASE/health"

curl -s "$BASE/$UUID/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

搜索测试：

```bash
curl -s "$BASE/$UUID/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_jiuye","arguments":{"query":"华为","page":1}}}'
```
