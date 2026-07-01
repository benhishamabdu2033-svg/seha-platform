const { Octokit } = require('@octokit/rest');

/**
 * Vercel / Node 18 compatible serverless handler (CommonJS)
 * Expects environment variables:
 *  - GITHUB_TOKEN (required)
 *  - GITHUB_OWNER (optional, default 'benhishamabdu2033-svg')
 *  - GITHUB_REPO  (optional, default 'seha-platform')
 *  - GITHUB_BRANCH (optional; when provided we use it as branch for reads/writes)
 *  - FILE_PATH (optional, default 'public/data.json')
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { leave } = req.body || {};
  if (!leave || !leave.leaveCode) {
    return res.status(400).json({ error: 'Invalid payload: missing leave or leave.leaveCode' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_OWNER = process.env.GITHUB_OWNER || 'benhishamabdu2033-svg';
  const GITHUB_REPO = process.env.GITHUB_REPO || 'seha-platform';
  const GITHUB_BRANCH = process.env.GITHUB_BRANCH || null;
  const FILE_PATH = process.env.FILE_PATH || 'public/data.json';

  if (!GITHUB_TOKEN) {
    return res.status(400).json({ error: 'Missing GITHUB_TOKEN' });
  }

  try {
    const octokit = new Octokit({ auth: GITHUB_TOKEN });

    // Attempt to read existing file
    let fileContent = [];
    let fileSha = null;

    try {
      const response = await octokit.rest.repos.getContent({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: FILE_PATH,
        ...(GITHUB_BRANCH ? { ref: GITHUB_BRANCH } : {})
      });

      // If response.data is an array => path is a directory; we expect a file.
      if (Array.isArray(response.data)) {
        throw new Error('Expected a file but repository path is a directory');
      }

      const raw = response.data.content || '';
      const content = Buffer.from(raw, 'base64').toString('utf8');
      const data = content ? JSON.parse(content) : {};
      fileContent = Array.isArray(data.leaves) ? data.leaves : [];
      fileSha = response.data.sha;
    } catch (err) {
      // If file not found -> initialize empty
      if (err.status === 404 || (err.message && err.message.includes('404'))) {
        fileContent = [];
        fileSha = null;
      } else {
        console.error('Error reading file from GitHub:', err);
        return res.status(500).json({ error: 'Failed to read file from GitHub', detail: err.message || err.toString() });
      }
    }

    // Insert or update leave entry
    const existingIndex = fileContent.findIndex((l) => l.leaveCode === leave.leaveCode);

    if (existingIndex >= 0) {
      fileContent[existingIndex] = leave;
    } else {
      fileContent.push(leave);
    }

    // Prepare commit
    const updatedContent = JSON.stringify({ leaves: fileContent }, null, 2);
    const encodedContent = Buffer.from(updatedContent, 'utf8').toString('base64');
    const commitMessage = `Save leave record: ${leave.leaveCode}`;

    const params = {
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: FILE_PATH,
      message: commitMessage,
      content: encodedContent,
      ...(GITHUB_BRANCH ? { branch: GITHUB_BRANCH } : {})
    };

    if (fileSha) {
      params.sha = fileSha; // update existing
    }

    await octokit.rest.repos.createOrUpdateFileContents(params);

    return res.status(200).json({ success: true, message: 'Record saved successfully' });
  } catch (error) {
    console.error('Error saving to GitHub:', error);
    // Provide status if Octokit attached one (helpful for debugging on Vercel logs)
    const status = error.status || 500;
    return res.status(500).json({ error: error.message || 'Internal Server Error', status });
  }
};
