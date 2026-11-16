# 发布指南 / Publishing

这份文档是给**仓库作者**看的，不会打进 npm 包（`package.json` 的 `files` 里没有它）。

目标：让别人能 `dsh plugin add dsh-style-detector` 一行装上。

---

## 0. 先决条件

| 项 | 要求 | 当前状态 |
| --- | --- | --- |
| `package.json` 声明 `dsh.bundle.patch` | 必须有，否则 `dsh plugin add` 装不上 | ✅ 已有 |
| `cordis.patch.yml` 在包根 | 一个 `- insert:` 条目，`name` 必须是 npm 包名 | ✅ 已有 |
| 仓库里有真实可用的代码 | 不能是占位仓库 | ✅ 已有（4700 行） |
| 仓库建满 1 天 | 市场 CI 自动检查 | 🕒 建于 2026-11-14，次日才满 |
| 仓库加 `dsh-plugin` topic | 市场收录要求 | ✅ 已加 6 个 topic |
| `repository` 字段指回仓库 | npm 包与仓库关联靠它 | ✅ 已填 `grq6414-hash` |

`package.json` 里的仓库地址**已经填好**（指向 `github.com/grq6414-hash/dsh-style-detector`）：

```jsonc
"repository": { "type": "git", "url": "git+https://github.com/grq6414-hash/dsh-style-detector.git" },
"homepage": "https://github.com/grq6414-hash/dsh-style-detector#readme",
"bugs": { "url": "https://github.com/grq6414-hash/dsh-style-detector/issues" },
```

前提是仓库就叫 `dsh-style-detector`、owner 是 `grq6414-hash`。换名字的话这三处要一起改。

---

## 1. 仓库 ✅ 已完成

仓库已建好并推送完毕：

- 地址：<https://github.com/grq6414-hash/dsh-style-detector>
- 分支 `main`，本地已设置 upstream 跟踪
- topic：`dsh-plugin` `dsh` `cordis` `chinese` `writing-tool` `ai-detection`

以后改了代码要推：

```bash
cd C:\Software\AI\DEEPSEEK2\dsh-style-detector
git add -A
git commit -m "feat: 说明这次改了什么"
git push
```

> **注意**：这台机器访问 `github.com:443` 不稳定，`git push` 有时报 `Recv failure: Connection was reset`。
> **直接重试一般就能过**。连续失败的话用 GitHub Desktop 或网页版上传也行——内容不依赖 git 历史。

---

## 2. 发布方式（二选一或都做）

### 方式 A：发 npm ✅ 已完成

已发布：`dsh-style-detector@0.1.1` → <https://www.npmjs.com/package/dsh-style-detector>

```bash
npm login                      # 首次需要；开了 2FA 的账号建议直接用 Automation Token
npm publish --access public    # 包名不带 scope，默认就是 public
```

发布前可以先看会打包哪些文件：

```bash
npm pack --dry-run
```

预期 11 个文件、约 83 kB：

```
CHANGELOG.md  LICENSE  README.en.md  README.md  client.js
cordis.patch.yml  icon.svg  index.js  locale/en.json  locale/zh.json  package.json
```

**发版流程**（以后每次更新）：

1. 改 `package.json` 的 `version`
2. 在 `CHANGELOG.md` 顶部加一节
3. `npm publish`
4. `git tag v0.1.1 && git push --tags`

> **首次发布会看到 `0.0.0-stage`**：registry 会先建一个占位版本并进入自动审核。
> 审核通过后 `latest` 自动指向正式版本（这次大约 2 分钟）。看到占位版本不用管。

> **2FA 提示**：账号设成 `auth-and-writes` 时，`npm publish` 会要 6 位验证码（`EOTP`）。
> 两种解法：发布时加 `--otp=<验证码>`，或改用 Automation Token（在 `~/.npmrc` 写
> `//registry.npmjs.org/:_authToken=...`），后者不需要验证码。

---
### 方式 B：只发 GitHub Release（不需要 npm 账号）✅ 已完成

v0.1.0 的 release 已经建好，`.tgz` 已上传：

- Release 页：<https://github.com/grq6414-hash/dsh-style-detector/releases/tag/v0.1.0>
- 直链：https://github.com/grq6414-hash/dsh-style-detector/releases/download/v0.1.0/dsh-style-detector-0.1.0.tgz

别人这样装：

```bash
dsh plugin add https://github.com/grq6414-hash/dsh-style-detector/releases/download/v0.1.0/dsh-style-detector-0.1.0.tgz
```

以后发新版：

```bash
npm pack                              # 生成 dsh-style-detector-x.y.z.tgz
gh release create vx.y.z dsh-style-detector-x.y.z.tgz --title "vx.y.z" --notes "改了什么"
```

> npm 和 Release 不冲突。发了 npm 之后，市场会优先给 `dsh plugin add dsh-style-detector` 这条短命令；
> 没发 npm 就只有长 URL。两个都做体验最好。
## 3. 提交到市场（可选，但推荐）

市场索引 [dsh-plugin-catalog](https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json) 由 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 生成。收录方式是**一个 PR、一个文件**。

新建 `data/plugins/grq6414-hash__dsh-style-detector.yml`：

```yaml
url: https://github.com/grq6414-hash/dsh-style-detector
name: grq6414-hash/dsh-style-detector
category: ui
description:
  en: 'Chinese prose "AI-flavor" detector: local rule engine scores and highlights template phrasing, uniform sentences, vague imagery and repetition, with a separate typo page; the score is always computed locally.'
  zh: '中文「AI 味」检测器：本地规则引擎打分并标出套话、句式均匀、缺画面感与重复，另设错字页；分数始终由本地算。'
```

注意事项：

- **描述里含 `: `（冒号加空格）必须加引号**，否则 YAML 解析失败（上面 `en` 已加）
- 描述**必须属实**，会被对着代码核。别写营销词，别虚报数字
- 分类取 `ui`（右侧栏面板）。选不准也没关系，维护者会改
- 一个 PR 最多 3 条，你只有一条，无所谓

CI 会依次检查：条目数量 → `dsh.bundle` 是否存在 → 仓库年龄 → `awesome-lint`。全绿之后由维护者人工读代码，确认描述与实现一致才合并。

---

## 4. 截图（可选，但很值）

市场详情页会展示 App Store 风格的截图。**在你自己的仓库里**声明，不用来提 PR：

`dsh-style-detector/screenshots.json`

```json
[
  "assets/screenshot-diagnose.png",
  "assets/screenshot-suggest.png",
  "assets/screenshot-typos.png"
]
```

规则：1–8 张、路径相对于这个文件、不能跳出插件目录、必须是仓库里已有的图。不声明也可以——市场会从 README 里自动抽图，只是你控制不了顺序。

---

## 5. 上线后自查

```bash
# 包能不能装
npm view dsh-style-detector version

# 市场索引里有没有你（合并后次日生效）
curl -s https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json | grep -o '"name":"dsh-style-detector"'
```

装到 DSH 里：

```bash
dsh plugin add dsh-style-detector
# 然后完全退出 DSH 再打开（不要只刷新）
```

---

## ⚠️ 装之前先卸掉本地开发版

如果你之前用 `created-plugins` 的 link 方式装过同一个插件的开发版，**必须先卸掉**。两个插件会抢同一个页签类型 `style-detector` 和同一组路由 `/dsh-style-detector/*`：

- 路由重复注册会抛错（本插件已 try/catch 兜住，结果是后装的那个静默失效）
- 页签类型重复注册会导致页签行为不可预测

卸载开发版：插件页里禁用并移除 `@dsh-local/view-...`，或从 profile 的 `package.json` 里删掉那条 `link:` 依赖与 `dsh.profile.bundles` 条目，再 `pnpm install`。
