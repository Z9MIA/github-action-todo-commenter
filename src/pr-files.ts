import { GetFilesParams } from './types';
import { exec as cbExec } from 'child_process';
import { promisify } from 'util';
import { debug, warning } from '@actions/core';

const exec = promisify(cbExec);

export async function getFiles({
  octokit,
  owner,
  repo,
  prNumber,
  base,
  head,
  ignoreFilesPattern
}: GetFilesParams) {
  debug(`getFiles, owner: ${owner}, ${repo}, ${prNumber}`);

  const { data: prFiles } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: {
      format: 'diff'
    }
  });

  const untracked = ['removed', 'unchanged'];
  let matcher = (file: typeof prFiles[number]) =>
    !untracked.includes(file.status) && Boolean(file.additions);

  if (ignoreFilesPattern) {
    const regex = new RegExp(ignoreFilesPattern);
    matcher = (file: typeof prFiles[number]) =>
      !untracked.includes(file.status) &&
      Boolean(file.additions) &&
      !file.filename.match(regex);
  }

  return Promise.all(
    prFiles.filter(matcher).map(async ({ filename, patch, blob_url }) => ({
      filename,
      // Noticed on big diffs the api doesn't return a patch string
      // Could not find documentation around size limit on `patch` field
      patch: patch ? patch : await diff(base, head, filename),
      blob_url: blob_url
    }))
  );
}

async function diff(
  base: string,
  head: string,
  filename: string
): Promise<string> {
  try {
    const { stdout, stderr } = await exec(
      `git diff origin/${base}...origin/${head} -- ${filename}`
    );
    if (stderr) {
      warning(stderr);
      return '';
    }

    return stdout;
  } catch (err: any) {
    warning(err);
    return '';
  }
}
