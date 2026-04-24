<div align="center">

# 📄 wecom-doc-mcp

**Let AI read your Enterprise WeChat docs — in real time.**

[![MCP](https://img.shields.io/badge/MCP-Compatible-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJ3aGl0ZSI+PHBhdGggZD0iTTEyIDJMMiA3bDEwIDUgMTAtNS0xMC01ek0yIDE3bDEwIDUgMTAtNS0xMC01LTEwIDV6TTIgMTJsMTAgNSAxMC01LTEwLTUtMTAgNXoiLz48L3N2Zz4=)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/Node.js-≥18-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

<br/>

<p>
  <img src="https://img.shields.io/badge/企业微信-文档-07C160?style=flat-square&logo=wechat&logoColor=white" />
  <img src="https://img.shields.io/badge/Claude_Code-Ready-D97706?style=flat-square" />
  <img src="https://img.shields.io/badge/Cookie-Auth-red?style=flat-square&logo=cookiecutter&logoColor=white" />
</p>

[English](#-why) · [中文](README_CN.md)

</div>

---

## 🤔 Why

> Enterprise WeChat documents sit behind SSO. AI assistants can't access them.

This MCP server bridges the gap: provide your browser cookie once, and the server handles authenticated fetching + HTML-to-Markdown conversion on every request.

```
💬 "帮我看下这个文档: https://doc.weixin.qq.com/doc/w3_xxx"
         │
         ▼
   ┌─────────────┐     🍪      ┌──────────────┐     📝     ┌──────────┐
   │ Claude Code  │ ──Cookie──▶ │  MCP Server   │ ──HTML──▶ │ Markdown │
   └─────────────┘             └──────────────┘            └──────────┘
```

## 🛠️ Tools

| Tool | Description |
|:-----|:------------|
| 📖 `fetch_wecom_doc` | Fetch a document by URL → return Markdown |
| 🍪 `set_wecom_cookie` | Save cookie locally (`chmod 600`) |
| ✅ `check_wecom_auth` | Verify if saved cookie is still valid |

## 🚀 Quick Start

### Step 1 — Install

```bash
git clone https://github.com/Tiansiyu-tj/wecom-doc-mcp.git
cd wecom-doc-mcp
npm install
```

### Step 2 — Register with Claude Code

Add to `~/.mcp.json`:

```json
{
  "mcpServers": {
    "wecom-doc": {
      "command": "npx",
      "args": ["tsx", "/path/to/wecom-doc-mcp/src/index.ts"]
    }
  }
}
```

### Step 3 — Get Your Cookie 🍪

```
1. 🌐  Open doc.weixin.qq.com → log in
2. 🔧  F12 → Network tab
3. 📋  Click any request → copy the Cookie header value
```

### Step 4 — Use It

```text
You:    帮我设置企业微信 Cookie: <paste>
Claude: ✅ Cookie 已保存

You:    帮我看下这个文档: https://doc.weixin.qq.com/doc/w3_xxx
Claude: # 文档标题
        这是文档的内容...
```

## 📐 Architecture

```
                          wecom-doc-mcp
                    ┌─────────────────────┐
                    │                     │
  fetch_wecom_doc ──┤  📡 /dop-api/opendoc│
        │           │  Call WeChat's       │
        │           │  internal API for    │──── 📝 Markdown
        │           │  document JSON data  │
        │           │                     │
        │           │  🧹 cleanDocText    │
        │           │  Strip HYPERLINK     │
        │           │  markup → clean text │
        │           │                     │
        │           │  📄 Fallback:       │
        │           │  cheerio + turndown  │
        │           └─────────────────────┘
        │
  set_wecom_cookie ─── 💾 ~/.claude/wecom-doc-mcp/.env (mode 600)
        │
  check_wecom_auth ─── 🏥 GET doc.weixin.qq.com → 200?
```

## 🔐 Cookie Auth

Two modes, your choice:

| Mode | How | When |
|:-----|:----|:-----|
| 💾 Persistent | `set_wecom_cookie` → saved to `~/.claude/wecom-doc-mcp/.env` | Set once, use forever (until expiry) |
| ⚡ Per-request | Pass `cookie` param to `fetch_wecom_doc` | Override on the fly |

> 🔒 Cookie file lives outside the project directory — never committed, never shared, `chmod 600`.

## 📑 Supported Document Types

| Type | URL Pattern | Status |
|:-----|:------------|:------:|
| 📝 Documents | `/doc/` | ✅ Verified |
| 📊 Spreadsheets | `/sheet/` | 🔧 Untested |
| 🎞️ Slides | `/slide/` | 🔧 Untested |
| 🧠 Mind Maps | `/mind/` | 🔧 Untested |
| 🔀 Flowcharts | `/flowchart/` | 🔧 Untested |
| 📋 Smart Sheets | `/smartsheet/` | 🔧 Untested |

## 📦 Tech Stack

| Dependency | Purpose |
|:-----------|:--------|
| `@modelcontextprotocol/sdk` | MCP protocol implementation |
| `cheerio` | HTML parsing |
| `turndown` | HTML → Markdown conversion |
| `tsx` | TypeScript runtime |

## 📄 License

MIT

---

<div align="center">
  <sub>Built with ❤️ for teams drowning in enterprise docs</sub>
</div>
