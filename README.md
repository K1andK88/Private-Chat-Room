# 🔒 Private Chat Room

端到端加密的实时聊天室 — 服务器无法读取任何消息内容。

## ✨ 特性

- **真正的 E2EE** — PBKDF2 + AES-256-GCM，密钥只在浏览器中，服务器永远只接触密文
- **昵称免注册** — 输入昵称直接使用，无需邮箱注册
- **图片加密传输** — 图片端到端加密上传，缩略图同样加密存储
- **消息撤回** — 支持发送后 5 分钟内撤回
- **引用回复 & @提及** — 完整的聊天交互体验
- **昵称加密** — 发送者昵称加密存储在消息体中，数据库不暴露身份信息
- **多主题** — 浅色/深色/跟随系统，绿色暖色调
- **响应式设计** — 桌面端和移动端均可使用，图片预览支持双指缩放
- **零成本部署** — Cloudflare Pages（前端）+ Supabase Free（实时通信），完全免费

## 🏗️ 架构

```
浏览器 A                     Supabase                      浏览器 B
┌──────────────┐         ┌──────────────┐            ┌──────────────┐
│ Web Crypto   │         │  Realtime    │            │ Web Crypto   │
│              │         │  WebSocket   │            │              │
│ 明文 → 密文  │──密文──→│  广播密文     │──密文──→  │ 密文 → 明文  │
│ (AES-256-GCM)│         │  (无法解密)   │            │ (AES-256-GCM)│
└──────────────┘         └──────────────┘            └──────────────┘
     ↕                                                    ↕
   Cloudflare Pages (静态托管 + 全球 CDN)
```

**密钥派生流程：**
```
房间密码 + Room ID
    ↓ PBKDF2 (SHA-256, 100,000 iterations)
AES-256 密钥
    ↓ AES-256-GCM 加密
{ ciphertext (base64), iv (base64) }
```

## 📦 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 6 |
| 样式 | Tailwind CSS 3 |
| E2EE | Web Crypto API (浏览器原生) |
| 实时通信 | Supabase Realtime (Broadcast) |
| 数据持久化 | Supabase PostgreSQL |
| 文件存储 | Supabase Storage |
| 部署 | Cloudflare Pages / Vercel |

## 🚀 部署步骤

### 1. 创建 Supabase 项目

1. 前往 [supabase.com](https://supabase.com) 注册（免费）
2. 创建新项目，记录 `Project URL` 和 `anon public key`
3. 进入 SQL Editor，执行 `supabase/schema.sql`（包含 rooms 表、messages 表、Storage Bucket、RLS 策略）

### 2. 配置环境变量

```bash
cp .env.example .env
```

填入：
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. 本地开发

```bash
npm install
npm run dev
```

### 4. 部署到 Vercel

**方式一：Vercel CLI（推荐）**
```bash
npm i -g vercel
vercel login
vercel
```
按提示操作完成后，在 Vercel Dashboard → Settings → Environment Variables 中添加：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

添加后重新部署（Deployments → 最新部署 → ⋯ → Redeploy）。

**方式二：连接 Git 仓库**
1. 把项目推到 GitHub
2. [vercel.com/new](https://vercel.com/new) 导入仓库
3. Framework preset 选 `Vite`
4. Environment Variables 中添加 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`
5. 点击 Deploy

### 5. 部署到 Cloudflare Pages

**方式一：连接 Git 仓库（推荐）**
1. 把项目推到 GitHub
2. Cloudflare Dashboard → Pages → 连接 Git 仓库
3. 构建设置：
   - Framework preset: `Vite`
   - 构建命令：`npm run build`
   - 输出目录：`dist`
4. 添加环境变量：`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`

**方式二：Wrangler CLI**
```bash
npm run build
npx wrangler pages deploy dist --project-name=private-chat-room
```
添加环境变量后在 Cloudflare Dashboard → Pages → 项目 → Settings → Environment variables 中配置。

## 📂 项目结构

```
Private-Chat-Room/
├── index.html                  # HTML 入口
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── .env.example                # 环境变量模板
├── supabase/
│   └── schema.sql              # 完整数据库初始化（rooms + messages + Storage + RLS）
└── src/
    ├── main.tsx                # React 入口
    ├── App.tsx                 # 主应用组件
    ├── index.css               # Tailwind + 自定义样式
    ├── lib/
    │   ├── supabase.ts         # Supabase 客户端
    │   ├── crypto.ts           # E2EE 核心逻辑
    │   ├── storage.ts          # 加密文件上传/下载
    │   ├── imageUtils.ts       # 图片处理（缩略图、验证）
    │   ├── theme.tsx           # 主题切换
    │   └── types.ts            # TypeScript 类型
    ├── components/
    │   ├── Login.tsx           # 昵称登录
    │   ├── Header.tsx          # 顶部导航
    │   ├── RoomEntry.tsx       # 房间创建/加入
    │   ├── MessageList.tsx     # 消息列表 + 图片预览
    │   ├── MessageInput.tsx    # 消息输入框 + 表情
    │   ├── MemberList.tsx      # 在线成员面板
    │   └── EmojiPicker.tsx     # 表情选择器
    └── hooks/
        ├── useRoom.ts          # 房间管理 + Presence
        └── useMessages.ts      # 消息收发 + 加解密
```

## 🔐 安全说明

- **密钥从不出浏览器** — AES-256 密钥通过 PBKDF2 从房间密码派生，仅在客户端内存中存在
- **服务器零知识** — Supabase 只存储和转发密文，没有任何解密能力
- **昵称加密** — 发送者昵称与消息内容一起加密，数据库中不暴露真实身份
- **确定性密钥派生** — 相同房间密码 + 相同房间 ID = 相同密钥，无需提前交换密钥
- **图片端到端加密** — 原图经 AES-256-GCM 加密后上传，缩略图加密存储在消息元数据中

## 💰 免费额度

| 服务 | 免费额度 |
|------|---------|
| Cloudflare Pages | 无限带宽、500 次构建/月 |
| Supabase PostgreSQL | 500MB |
| Supabase Realtime | 200 并发连接 |
| Supabase Storage | 1GB |

## 📜 License

MIT
