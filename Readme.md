# 📘 Push Markdown to Notion GitHub Action

This GitHub Action automatically detects changed Markdown (`.md`) files in the **most recent commit**, parses them for Notion frontmatter, and updates the corresponding Notion pages with their contents.

It supports automatic block conversion, page title updates, and handles Notion’s API limits for block updates.

---

## 🚀 Features

- ✅ Detects and processes only `.md` files **changed in the most recent commit**
- 🧠 Converts Markdown content to Notion blocks using [`@tryfabric/martian`](https://github.com/tryfabric/martian)
- ✏️ Updates page title if provided in frontmatter
- 🧹 Clears existing content before uploading fresh blocks
- 🧱 Automatically handles Notion’s 100-block-per-request limit on appending children blocks
- 🧱 Rest of the API limits are same as that of notion
- 🔐 Uses GitHub Actions input and secrets for secure token access

---

## 📁 Markdown File Format

Your Markdown file should include frontmatter at top like:

```markdown
---
title: 'New Notion Page Title'
notion_page: https://www.notion.so/your-notion-page-abc123def456
---

## Markdown Content

Rest of the content goes here
```

## Example

```yaml
name: Push MD to Notion

on:
  push:
    branches: [main]

jobs:
  sync-to-notion:
    runs-on: ubuntu-latest
    steps:
      - name: Push changed markdown to Notion
        uses: step-security/push-md-to-notion@v0
        with:
          notion-token: ${{ secrets.NOTION_TOKEN }}
```

## 🔧 Inputs

| Name           | Required | Description                                              |
| -------------- | -------- | -------------------------------------------------------- |
| `notion-token` | ✅ Yes   | Token from your Notion integration (used for API access) |
