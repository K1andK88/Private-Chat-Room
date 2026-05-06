# 🔒 Private Chat Room

端到端加密的实时聊天室 — 服务器无法读取任何消息内容。

## ✨ 特性

- **真正的 E2EE** — PBKDF2 + AES-256-GCM，密钥只在浏览器中，服务器永远只接触密文
- **昵称免注册** — 输入昵称直接使用，无需邮箱注册
- **图片加密传输** — 图片端到端加密上传，缩略图同样加密存储
- **消息自动消失** — 可自定义过期时间（默认 10 分钟，通过环境变量配置）
- **密码验证** — 加入房间时验证密码正确性，空房间也可验证（基于加密验证字段）
- **房间号唯一** — 创建时检测房间号是否已存在，已存在则提示
- **消息撤回** — 支持发送后撤回（窗口可配，默认 2 分钟）
- **引用回复 & @提及** — 完整的聊天交互体验
- **桌面通知** — 可选浏览器通知弹窗 + 可自定义提示音（内置/系统/自定义上传），仅页面不可见时触发
- **图片上传重试** — Storage 上传失败时自动缓存至 IndexedDB，支持手动重传
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

# Optional: set a password to gate access to the site
# VITE_ACCESS_PASSWORD=your-access-password

# Optional: message expiration time in minutes (default: 10)
# VITE_MESSAGE_TTL=10

# Optional: message revoke window in minutes (default: 2)
# VITE_REVOKE_WINDOW=2

# Optional: custom verify secret for room password (default: PCR_VERIFY_2026)
# VITE_VERIFY_SECRET=your-custom-secret
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

可选环境变量：
- `VITE_ACCESS_PASSWORD` — 访问密码（保护网站入口）
- `VITE_MESSAGE_TTL` — 消息过期时间（分钟，默认 10）
- `VITE_REVOKE_WINDOW` — 消息撤回窗口（分钟，默认 2）
- `VITE_VERIFY_SECRET` — 房间密码验证令牌（默认 `PCR_VERIFY_2026`，自定义后旧房间需重建）

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
4. 添加环境变量：`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`（可选：`VITE_ACCESS_PASSWORD`、`VITE_MESSAGE_TTL`、`VITE_REVOKE_WINDOW`、`VITE_VERIFY_SECRET`）

**方式二：Wrangler CLI**
```bash
npm run build
npx wrangler pages deploy dist --project-name=private-chat-room
```
添加环境变量后在 Cloudflare Dashboard → Pages → 项目 → Settings → Environment variables 中配置（可选：`VITE_ACCESS_PASSWORD`、`VITE_MESSAGE_TTL`、`VITE_REVOKE_WINDOW`、`VITE_VERIFY_SECRET`）。

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
├── public/
│   └── sounds/                # 内置提示音 (mp3)
└── src/
    ├── main.tsx                # React 入口
    ├── App.tsx                 # 主应用组件
    ├── index.css               # Tailwind + 自定义样式
    ├── lib/
    │   ├── supabase.ts         # Supabase 客户端
    │   ├── crypto.ts           # E2EE 核心逻辑
    │   ├── storage.ts          # 加密文件上传/下载
    │   ├── imageUtils.ts       # 图片处理（缩略图、验证）
    │   ├── pendingUploads.ts    # IndexedDB 图片重传缓存
    │   ├── sound.ts            # 音效播放 + 自定义音效 IndexedDB
    │   ├── theme.tsx           # 主题切换
    │   └── types.ts            # TypeScript 类型
    ├── components/
    │   ├── Login.tsx           # 昵称登录
    │   ├── Header.tsx          # 顶部导航 + 通知/音效设置
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
- **密码验证** — 创建房间时生成加密验证令牌（`password_verify`），加入时通过解密验证密码，空房间也安全
- **访问密码保护** — 可选，设置 `VITE_ACCESS_PASSWORD` 环境变量后，访问网站需先输入密码

## 💰 免费额度

| 服务 | 免费额度 |
|------|---------|
| Cloudflare Pages | 无限带宽、500 次构建/月 |
| Supabase PostgreSQL | 500MB |
| Supabase Realtime | 200 并发连接 |
| Supabase Storage | 1GB |

## 📜 License

MIT
