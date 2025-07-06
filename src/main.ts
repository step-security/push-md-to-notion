import * as github from '@actions/github';
import * as core from '@actions/core';
import fs from 'fs';
import matter from 'gray-matter';
import httpClient from './http';
import { markdownToBlocks } from '@tryfabric/martian';
import { AxiosResponse, isAxiosError } from 'axios';

function getHeaders(notionToken:string){
  return {
    Authorization: `Bearer ${notionToken}`,
    'Notion-Version': '2022-06-28'
  };
}

async function getChangedMarkdownFiles(): Promise<string[]> {
  const github_token = core.getInput('github-token') || process.env.GITHUB_TOKEN || '';
  const octokit = github.getOctokit(github_token);
  const context = github.context;

  const sha = context.sha;

  const { data } = await octokit.rest.repos.getCommit({
    owner: context.repo.owner,
    repo: context.repo.repo,
    ref: sha
  });

  return data.files
    ?.filter(file => file.filename.endsWith('.md') && file.status !== 'removed')
    .map(file => file.filename) ?? [];
}

async function getAllChildrenBlocks(
  blockId: string,
  token: string
): Promise<any[]> {
  let allBlocks: any[] = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;

  while (hasMore) {
    const response : AxiosResponse = await httpClient.get('/blocks/' + blockId + '/children', {
      headers: getHeaders(token),
      params: startCursor ? { start_cursor: startCursor } : {}
    });

    const data = response.data;
    allBlocks.push(...((data.results).map((block : any) => block.id)));

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
  await httpClient.patch(`/pages/${pageId}`, {
    properties: {
      title: {
        title: [
          {
            type: 'text',
            text: {
              content: newTitle
            }
          }
        ]
      }
    }
  }, {
    headers: getHeaders(notionToken),
  });

  core.info(`✅ Updated title to "${newTitle}" for page ${pageId}`);
}

async function pushMdFilesToNotion(notionToken : string) {
  const markdownFiles = await getChangedMarkdownFiles();
  core.debug(markdownFiles.join('\n'))
  // loop over all the markdown files and push the corresponding ones to notion
  for(let f of markdownFiles){
    const content = fs.readFileSync(f, 'utf8');
    const parsed_content = matter(content);
    if(
      typeof parsed_content.data.notion_page === 'string' &&
      (
        typeof parsed_content.data.title === 'string' ||
        typeof parsed_content.data.title === 'undefined'
      )
    ){
      const parentBlockId = parsed_content.data.notion_page.split('-').pop()
      if (!parentBlockId) {
        core.info(`Could not extract block ID from ${parsed_content.data.notion_page}. Skipping this file: ${f}`);
      }
      else{

        //update the title of the page if present
        if(parsed_content.data.title){
          core.info("Updating page title")
          await updateNotionPageTitle(
            parentBlockId,
            parsed_content.data.title,
            notionToken
          )
        }

        // Get all children blocks for current page and delete them
        core.info("Fetching current page from notion as blocks")
        const childrenBlockIds = await getAllChildrenBlocks(parentBlockId, notionToken)
        for (let blockId of childrenBlockIds){
          await httpClient.delete(`/blocks/${blockId}`, {
            headers: getHeaders(notionToken),
          });
        }

        //convert the markdown to content to notion blocks
        const blocks = markdownToBlocks(parsed_content.content)

        //append these new blocks to the empty page
        core.info("Uploading blocks to notion page")
        await httpClient.patch(`/blocks/${parentBlockId}/children`, {
          children: blocks
        }, {
          headers: getHeaders(notionToken),
        });
      }
    }
  }    
}

async function run() {
  try {
    const notionToken = core.getInput('notion-token', { required: true });
    await pushMdFilesToNotion(notionToken);
  } catch (e) {
    if (isAxiosError(e)) {
      const status = e.response?.status || 'unknown';
      const message = e.message;
      const responseData = e.response?.data
        ? JSON.stringify(e.response.data, null, 2)
        : 'No response body';

      core.error([
        '❌ AxiosError:',
        `Status: ${status}`,
        `Message: ${message}`,
        `Response: ${responseData}`,
        `Stack: ${e.stack || 'No stack trace'}`
      ].join('\n'));
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