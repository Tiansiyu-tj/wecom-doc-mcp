// 文件名: index.ts
// 创建版本: v1.0
// 最后更新: v1.2
// 改动历史:
//   v1.0 (2026-04-24): 初始创建，企业微信文档 MCP Server
//   v1.1 (2026-04-24): 修复登录检测误判，改用 /dop-api/opendoc 接口抓取文档正文
//   v1.2 (2026-04-24): 支持脑图(mind)类型，递归提取树形节点为 Markdown

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// v1.0 - Cookie 存储路径
const CONFIG_DIR = join(homedir(), ".claude", "wecom-doc-mcp");
const ENV_FILE = join(CONFIG_DIR, ".env");

// v1.0 - Turndown 实例，HTML 转 Markdown
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

// v1.0 - 从配置文件读取 Cookie
function loadCookieFromFile(): string | null {
  try {
    if (!existsSync(ENV_FILE)) return null;
    const content = readFileSync(ENV_FILE, "utf-8");
    const match = content.match(/^WECOM_COOKIE=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

// v1.0 - 保存 Cookie 到配置文件
function saveCookieToFile(cookie: string): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(ENV_FILE, `WECOM_COOKIE=${cookie}\n`, "utf-8");
  chmodSync(ENV_FILE, 0o600);
}

// v1.0 - 获取有效 Cookie（参数优先，否则读配置文件）
function getEffectiveCookie(paramCookie?: string): string | null {
  return paramCookie?.trim() || loadCookieFromFile();
}

// v1.0 - 通用请求头
function buildHeaders(cookie: string): Record<string, string> {
  return {
    Cookie: cookie,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Referer: "https://doc.weixin.qq.com/",
  };
}

// v1.0 - 从 URL 提取文档 ID
function extractDocId(url: string): string | null {
  const patterns = [
    /\/doc\/([A-Za-z0-9_-]+)/,
    /\/sheet\/([A-Za-z0-9_-]+)/,
    /\/slide\/([A-Za-z0-9_-]+)/,
    /\/mind\/([A-Za-z0-9_-]+)/,
    /\/flowchart\/([A-Za-z0-9_-]+)/,
    /\/smartsheet\/([A-Za-z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// v1.1 - 清理文档原始文本中的 HYPERLINK 标记，转为 Markdown 链接
function cleanDocText(raw: string): string {
  // v1.1 - 匹配所有 HYPERLINK 模式，提取 URL 转为 Markdown 链接
  let text = raw.replace(
    /\x13?HYPERLINK\s+(https?:\/\/\S+)[^\x13一-鿿\n]*/g,
    (_, url) => `[链接](${url})`
  );
  // v1.1 - 清理残留 \x13 控制字符
  text = text.replace(/\x13/g, "");
  // v1.1 - 将 \r 转为换行
  text = text.replace(/\r/g, "\n");
  // v1.1 - 清理多余空行
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

// v1.1 - 通过 /dop-api/opendoc 接口抓取文档内容
async function fetchWecomDoc(
  url: string,
  cookie: string
): Promise<string> {
  const headers = buildHeaders(cookie);
  const padId = extractDocId(url);

  if (!padId) {
    throw new Error("无法从 URL 中提取文档 ID");
  }

  // v1.1 - 调用 opendoc API 获取文档数据
  const apiUrl = `https://doc.weixin.qq.com/dop-api/opendoc?normal=1&noEscape=1&outformat=1&id=${padId}`;
  const apiResp = await fetch(apiUrl, {
    headers: {
      ...headers,
      Accept: "application/json, text/plain, */*",
      Referer: url,
    },
    redirect: "follow",
  });

  if (!apiResp.ok) {
    if (apiResp.status === 401 || apiResp.status === 403) {
      throw new Error(
        `认证失败 (${apiResp.status})，Cookie 可能已过期，请使用 set_wecom_cookie 更新`
      );
    }
    throw new Error(`API 请求失败: HTTP ${apiResp.status} ${apiResp.statusText}`);
  }

  const data = await apiResp.json() as any;

  // v1.1 - 提取标题
  const title =
    data?.clientVars?.padTitle ||
    data?.clientVars?.initialTitle ||
    data?.clientVars?.title ||
    "未知标题";

  // v1.1 - 提取文档正文
  let docText = "";

  // v1.2 - 脑图类型：递归提取树形节点
  const padType = data?.padType || data?.clientVars?.padType || "";
  const textArr = data?.clientVars?.collab_client_vars?.initialAttributedText?.text;
  if (padType === "mind" && textArr?.[0]?.content?.[0]?.rootTopic) {
    const root = textArr[0].content[0].rootTopic;
    const getTitle = (node: any): string => {
      const t = node?.title;
      if (!t) return "(空)";
      if (typeof t === "string") return t.trim() || "(空)";
      if (typeof t === "object" && t.text) return String(t.text).trim();
      return String(t).trim() || "(空)";
    };
    const renderNode = (node: any, depth: number): string[] => {
      const lines: string[] = [];
      const t = getTitle(node);
      if (depth === 0) lines.push(`# ${t}\n`);
      else if (depth === 1) lines.push(`## ${t}\n`);
      else if (depth === 2) lines.push(`### ${t}\n`);
      else lines.push(`${"  ".repeat(depth - 3)}- ${t}`);
      const children = node?.children?.attached || [];
      for (const child of children) {
        lines.push(...renderNode(child, depth + 1));
      }
      return lines;
    };
    return renderNode(root, 0).join("\n");
  }

  try {
    const commands =
      data?.clientVars?.collab_client_vars?.initialAttributedText?.text?.[0]?.commands;
    if (commands && commands.length > 0) {
      for (const cmd of commands) {
        if (cmd.mutations) {
          for (const m of cmd.mutations) {
            if (m.s && typeof m.s === "string") {
              docText += m.s;
            }
          }
        }
      }
    }
  } catch {}

  if (!docText) {
    // v1.1 - 兜底：尝试从 HTML 页面提取
    const pageResp = await fetch(url, { headers, redirect: "follow" });
    const html = await pageResp.text();
    const $ = cheerio.load(html);
    $("script, style, nav, header, footer, .toolbar").remove();
    const bodyHtml = $("body").html() || html;
    return `# ${title}\n\n${turndown.turndown(bodyHtml)}`;
  }

  // v1.1 - 清理控制标记
  const cleanedText = cleanDocText(docText);

  return `# ${title}\n\n${cleanedText}`;
}

// v1.0 - 检查 Cookie 有效性
async function checkAuth(cookie: string): Promise<boolean> {
  try {
    const resp = await fetch("https://doc.weixin.qq.com/", {
      headers: buildHeaders(cookie),
      redirect: "manual",
    });
    return resp.status === 200;
  } catch {
    return false;
  }
}

// v1.0 - MCP Server 初始化
const server = new Server(
  { name: "wecom-doc", version: "1.0.0" },
  {
    capabilities: { tools: {} },
    instructions:
      "企业微信文档读取工具。使用前需要先通过 set_wecom_cookie 设置 Cookie，" +
      "或在 ~/.claude/wecom-doc-mcp/.env 中配置 WECOM_COOKIE。" +
      "Cookie 获取方式：在浏览器中登录 doc.weixin.qq.com，打开开发者工具 → Network → " +
      "复制任意请求的 Cookie 请求头值。",
  }
);

// v1.0 - 注册工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "fetch_wecom_doc",
      description:
        "抓取企业微信文档内容并转为 Markdown。支持文档、表格、幻灯片等类型。",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "企业微信文档链接，如 https://doc.weixin.qq.com/doc/xxx",
          },
          cookie: {
            type: "string",
            description: "可选，临时 Cookie。不传则使用已保存的 Cookie",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "set_wecom_cookie",
      description:
        "保存企业微信 Cookie 到本地配置文件，后续请求自动使用。" +
        "Cookie 获取：浏览器登录 doc.weixin.qq.com → F12 → Network → 复制 Cookie 头。",
      inputSchema: {
        type: "object" as const,
        properties: {
          cookie: {
            type: "string",
            description: "完整的 Cookie 字符串",
          },
        },
        required: ["cookie"],
      },
    },
    {
      name: "check_wecom_auth",
      description: "检查当前保存的 Cookie 是否仍然有效",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
  ],
}));

// v1.0 - 工具调用处理
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "fetch_wecom_doc": {
      const url = args?.url as string;
      if (!url) {
        return { content: [{ type: "text", text: "错误：缺少 url 参数" }] };
      }
      if (!url.includes("doc.weixin.qq.com")) {
        return {
          content: [
            {
              type: "text",
              text: "错误：URL 不是企业微信文档链接（需要 doc.weixin.qq.com 域名）",
            },
          ],
        };
      }
      const cookie = getEffectiveCookie(args?.cookie as string | undefined);
      if (!cookie) {
        return {
          content: [
            {
              type: "text",
              text: "错误：未找到 Cookie。请先使用 set_wecom_cookie 设置，或在调用时传入 cookie 参数。\n\n" +
                "获取方式：浏览器登录 doc.weixin.qq.com → F12 → Network → 复制任意请求的 Cookie 头",
            },
          ],
        };
      }
      try {
        const markdown = await fetchWecomDoc(url, cookie);
        return { content: [{ type: "text", text: markdown }] };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `抓取失败：${e.message}` }],
        };
      }
    }

    case "set_wecom_cookie": {
      const cookie = args?.cookie as string;
      if (!cookie) {
        return { content: [{ type: "text", text: "错误：缺少 cookie 参数" }] };
      }
      saveCookieToFile(cookie);
      return {
        content: [
          {
            type: "text",
            text: `Cookie 已保存到 ${ENV_FILE}（权限 600）。后续调用 fetch_wecom_doc 将自动使用此 Cookie。`,
          },
        ],
      };
    }

    case "check_wecom_auth": {
      const cookie = loadCookieFromFile();
      if (!cookie) {
        return {
          content: [
            {
              type: "text",
              text: "未找到已保存的 Cookie，请先使用 set_wecom_cookie 设置。",
            },
          ],
        };
      }
      const valid = await checkAuth(cookie);
      return {
        content: [
          {
            type: "text",
            text: valid
              ? "Cookie 有效，可以正常访问企业微信文档。"
              : "Cookie 已失效或无法连接，请重新获取并使用 set_wecom_cookie 更新。",
          },
        ],
      };
    }

    default:
      return { content: [{ type: "text", text: `未知工具: ${name}` }] };
  }
});

// v1.0 - 启动 server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// v1.0 - 防止未捕获异常导致进程退出
process.on("unhandledRejection", (err) => {
  console.error("[wecom-doc-mcp] unhandledRejection:", err);
});

main().catch((err) => {
  console.error("[wecom-doc-mcp] 启动失败:", err);
  process.exit(1);
});
