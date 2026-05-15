[![StepSecurity Maintained Action](https://raw.githubusercontent.com/step-security/maintained-actions-assets/main/assets/maintained-action-banner.png)](https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions)

# 📘 Push Markdown to Notion GitHub Action

This GitHub Action automatically detects changed Markdown (`.md`) files in the **most recent commit**, parses them for Notion frontmatter, and updates the corresponding Notion pages with their contents.

It supports automatic block conversion, page title updates, and handles Notion’s API limits for block updates.

---

## 🚀 Features

- ✅ Detects and processes only `.md` files **changed in the most recent commit**
- 🧠 Converts Markdown content to Notion blocks using [`@tryfabric/martian`](https://github.com/tryfabric/martian)
- ✏️ Updates page title if provided in frontmatter
- 🧹 Clears existing content before uploading fresh blocks
- 🧱 Automatically handles Notion's 100-block-per-request limit on appending children blocks
- 🧱 Rest of the API limits are same as that of notion
- 🔐 Uses GitHub Actions input and secrets for secure token access
- ⚠️ Adds warning callout block to each page linking back to the source file on GitHub
- 🔍 Supports dry-run mode for validating Notion connection without making changes

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

## Examples

### Basic Usage - Sync on Push to Main

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
        uses: step-security/push-md-to-notion@v1
        with:
          notion-token: ${{ secrets.NOTION_TOKEN }}
```

### Dry Run on Pull Requests

Validate your Notion setup on PRs before merging:

```yaml
name: Validate Notion Sync

on:
  pull_request:
    branches: [main]

jobs:
  validate-notion-sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Validate Notion connection
        uses: step-security/push-md-to-notion@v1
        with:
          notion-token: ${{ secrets.NOTION_TOKEN }}
          dry-run: true
```

### Combined Workflow - Validate on PR, Sync on Merge

```yaml
name: Notion Sync

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  notion-sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Sync to Notion
        uses: step-security/push-md-to-notion@v1
        with:
          notion-token: ${{ secrets.NOTION_TOKEN }}
          dry-run: ${{ github.event_name == 'pull_request' }}
```

## 🔧 Inputs

| Name           | Required | Default | Description                                                                          |
| -------------- | -------- | ------- | ------------------------------------------------------------------------------------ |
| `notion-token` | ✅ Yes   | -       | Token from your Notion integration (used for API access)                             |
| `dry-run`      | ❌ No    | `false` | Run in dry-run mode - validates connection and lists changes without updating Notion |
