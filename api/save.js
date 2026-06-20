const { Octokit } = require('@octokit/rest');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { leave } = req.body;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_OWNER = process.env.GITHUB_OWNER || 'benhishamabdu2033-svg';
  const GITHUB_REPO = process.env.GITHUB_REPO || 'seha-platform';
  const FILE_PATH = process.env.FILE_PATH || 'public/data.json';

  if (!GITHUB_TOKEN) {
    return res.status(400).json({ error: 'Missing GITHUB_TOKEN' });
  }

  try {
    const octokit = new Octokit({ auth: GITHUB_TOKEN });

    // Get current file content
    let fileContent = [];
    let fileSha;

    try {
      const response = await octokit.repos.getContent({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: FILE_PATH,
      });

      const content = Buffer.from(response.data.content, 'base64').toString('utf8');
      const data = JSON.parse(content);
      fileContent = data.leaves || [];
      fileSha = response.data.sha;
    } catch (error) {
      // File doesn't exist, initialize empty
      fileContent = [];
      fileSha = null;
    }

    // Add or update leave record
    const existingIndex = fileContent.findIndex(
      (l) => l.leaveCode === leave.leaveCode
    );

    if (existingIndex >= 0) {
      fileContent[existingIndex] = leave;
    } else {
      fileContent.push(leave);
    }

    // Write updated content to GitHub
    const updatedContent = JSON.stringify({ leaves: fileContent }, null, 2);
    const encodedContent = Buffer.from(updatedContent).toString('base64');

    const commitMessage = `Save leave record: ${leave.leaveCode}`;

    if (fileSha) {
      // Update existing file
      await octokit.repos.createOrUpdateFileContents({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: FILE_PATH,
        message: commitMessage,
        content: encodedContent,
        sha: fileSha,
      });
    } else {
      // Create new file
      await octokit.repos.createOrUpdateFileContents({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: FILE_PATH,
        message: commitMessage,
        content: encodedContent,
      });
    }

    return res.status(200).json({ success: true, message: 'Record saved successfully' });
  } catch (error) {
    console.error('Error saving to GitHub:', error);
    return res.status(500).json({ error: error.message });
  }
};
