import * as core from '@actions/core';
import fs from 'fs';
import matter from 'gray-matter';
import httpClient from './http';
import { markdownToBlocks } from '@tryfabric/martian';
import axios, { AxiosResponse, isAxiosError } from 'axios';
import * as cp from 'child_process';

async function validateSubscription(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH
  let repoPrivate: boolean | undefined

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
    repoPrivate = eventData?.repository?.private
  }

  const upstream = 'step-security/push-md-to-notion'
  const action = process.env.GITHUB_ACTION_REPOSITORY
  const docsUrl =
    'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions'

  core.info('')
  core.info('[1;36mStepSecurity Maintained Action[0m')
  core.info(`Secure drop-in replacement for ${upstream}`)
  if (repoPrivate === false)
    core.info('[32m✓ Free for public repositories[0m')
  core.info(`[36mLearn more:[0m ${docsUrl}`)
  core.info('')

  if (repoPrivate === false) return

  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'
  const body: Record<string, string> = {action: action || ''}
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      {timeout: 3000}
    )
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error(
        `[1;31mThis action requires a StepSecurity subscription for private repositories.[0m`
      )
      core.error(
        `[31mLearn how to enable a subscription: ${docsUrl}[0m`
      )
      process.exit(1)
    }
    core.info('Timeout or API not reachable. Continuing to next step.')
  }
}

function getHeaders(notionToken: string) {
  return {
    Authorization: `Bearer ${notionToken}`,
    'Notion-Version': '2022-06-28',
  };
}

function getEditedMarkdownFiles(): string[] {
  const allChangedFiles = cp.execSync('git show --name-only --pretty=format:', {
    encoding: 'utf-8',
  });

  const changedMarkdownFiles = allChangedFiles
    .trim()
    .split('\n')
    .filter((fn) => fn.endsWith('.md'));

  return changedMarkdownFiles;
}

async function getAllChildrenBlocks(
  blockId: string,
  token: string
): Promise<any[]> {
  let allBlocks: any[] = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;

  while (hasMore) {
    const response: AxiosResponse = await httpClient.get(
      '/blocks/' + blockId + '/children',
      {
        headers: getHeaders(token),
        params: startCursor ? { start_cursor: startCursor } : {},
      }
    );

    const data = response.data;
    allBlocks.push(...data.results.map((block: any) => block.id));

    hasMore = data.has_more;
    startCursor = data.next_cursor;
  }

  return allBlocks;
}

async function updateNotionPageTitle(
  pageId: string,
  newTitle: string,
  notionToken: string
): Promise<void> {
  await httpClient.patch(
    `/pages/${pageId}`,
    {
      properties: {
        title: {
          title: [
            {
              type: 'text',
              text: {
                content: newTitle,
              },
            },
          ],
        },
      },
    },
    {
      headers: getHeaders(notionToken),
    }
  );

  core.info(`✅ Updated title to "${newTitle}" for page ${pageId}`);
}

function chunkBlocks<T>(blocks: T[], size = 100): T[][] {
  const chunks = [];
  for (let i = 0; i < blocks.length; i += size) {
    chunks.push(blocks.slice(i, i + size));
  }
  return chunks;
}

function createWarningBlock(fileName: string): any {
  const repo = process.env.GITHUB_REPOSITORY || '';
  const sha = process.env.GITHUB_SHA || '';
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';

  const fileUrl = `${serverUrl}/${repo}/blob/${sha}/${fileName}`;

  return {
    type: 'callout',
    callout: {
      rich_text: [
        {
          type: 'text',
          text: {
            content:
              'This file is linked to Github. Changes must be made in the ',
          },
        },
        {
          type: 'text',
          text: {
            content: 'markdown file',
            link: {
              url: fileUrl,
            },
          },
          annotations: {
            code: false,
          },
        },
        {
          type: 'text',
          text: {
            content: ' to be permanent.',
          },
        },
      ],
      icon: {
        emoji: '⚠️',
      },
      color: 'yellow_background',
    },
  };
}

async function pushMdFilesToNotion(notionToken: string, dryRun: boolean) {
  const markdownFiles = await getEditedMarkdownFiles();
  if (markdownFiles.length === 0) {
    core.info('No markdown files with changes detected for current commit');
    return;
  }
  core.debug(markdownFiles.join('\n'));

  if (dryRun) {
    core.info('🔍 DRY RUN MODE - No changes will be made to Notion');
    core.info('');
  }

  // loop over all the markdown files and push the corresponding ones to notion
  for (let f of markdownFiles) {
    const content = fs.readFileSync(f, 'utf8');
    const parsed_content = matter(content);
    if (
      typeof parsed_content.data.notion_page === 'string' &&
      (typeof parsed_content.data.title === 'string' ||
        typeof parsed_content.data.title === 'undefined')
    ) {
      core.info(`notion frontmatter found for ${f}`);
      const parentBlockId = parsed_content.data.notion_page.split('-').pop();
      if (!parentBlockId) {
        core.info(
          `Could not extract block ID from ${parsed_content.data.notion_page}. Skipping this file: ${f}`
        );
      } else {
        if (dryRun) {
          // In dry-run mode, validate connection and show what would be changed
          core.info(`📄 File: ${f}`);
          core.info(`   Page ID: ${parentBlockId}`);
          if (parsed_content.data.title) {
            core.info(
              `   Would update title to: "${parsed_content.data.title}"`
            );
          }

          // Test Notion connection by fetching the page
          try {
            await httpClient.get(`/blocks/${parentBlockId}`, {
              headers: getHeaders(notionToken),
            });
            core.info(
              `   ✅ Connection validated - page exists and is accessible`
            );
          } catch (error) {
            if (isAxiosError(error)) {
              core.error(
                `   ❌ Connection failed: ${error.response?.status} - ${error.response?.data?.message || error.message}`
              );
            } else {
              core.error(`   ❌ Connection failed: ${String(error)}`);
            }
          }

          const blocks = markdownToBlocks(parsed_content.content);
          core.info(`   Would sync ${blocks.length} blocks`);
          core.info('');
        } else {
          //update the title of the page if present
          if (parsed_content.data.title) {
            core.info('Updating page title');
            await updateNotionPageTitle(
              parentBlockId,
              parsed_content.data.title,
              notionToken
            );
          }

          // Get all children blocks for current page and delete them
          core.info('Fetching current page from notion as blocks');
          const childrenBlockIds = await getAllChildrenBlocks(
            parentBlockId,
            notionToken
          );
          for (let blockId of childrenBlockIds) {
            await httpClient.delete(`/blocks/${blockId}`, {
              headers: getHeaders(notionToken),
            });
          }

          //convert the markdown to content to notion blocks
          const blocks = markdownToBlocks(parsed_content.content);

          // Add warning block at the beginning
          const warningBlock = createWarningBlock(f);
          const allBlocks = [warningBlock, ...blocks];

          //append these new blocks to the empty page
          core.info('Uploading blocks to notion page');
          //seperate blocks into chunks of 100 to not cross API limits.
          const blockChunks = chunkBlocks(allBlocks, 100);
          for (const chunk of blockChunks) {
            await httpClient.patch(
              `/blocks/${parentBlockId}/children`,
              {
                children: chunk,
              },
              {
                headers: getHeaders(notionToken),
              }
            );
          }
          core.info(`✅ Pushed file ${f} to notion`);
        }
      }
    } else {
      core.info(`no notion frontmatter found for ${f}`);
    }
  }
}

async function run() {
  try {
    await validateSubscription();
    const notionToken = core.getInput('notion-token', { required: true });
    const dryRun = core.getInput('dry-run') === 'true';
    await pushMdFilesToNotion(notionToken, dryRun);
    if (dryRun) {
      core.info(
        `✅ Dry run completed - validated connection and listed changes`
      );
    } else {
      core.info(`✅ Pushed all markdown files to notion`);
    }
  } catch (e) {
    if (isAxiosError(e)) {
      const status = e.response?.status || 'unknown';
      const message = e.message;
      const responseData = e.response?.data
        ? JSON.stringify(e.response.data, null, 2)
        : 'No response body';

      core.error(
        [
          '❌ AxiosError:',
          `Status: ${status}`,
          `Message: ${message}`,
          `Response: ${responseData}`,
          `Stack: ${e.stack || 'No stack trace'}`,
        ].join('\n')
      );
    } else {
      core.error(`❌ Unexpected error: ${String(e)}`);
      if (e instanceof Error && e.stack) {
        core.error(e.stack);
      }
    }

    // Fail the action step
    core.setFailed('Markdown-to-Notion sync failed.');
  }
}

run();
