# ArtX Test Release Rules

- When the user says "提交到测试环境", "发布到测试环境", "把当前任务发布到测试环境", or otherwise asks to publish to the test environment, the required path is: local code commit -> push to GitHub -> GitHub Pages / test frontend redeploy -> verify the online test frontend version.
- Unless the user explicitly says to generate a local test link, do not bypass GitHub for test-environment publishing.
- Tencent Cloud is only the backend replacement for the old Render backend; all frontend and backend code changes must still be committed and pushed to GitHub, then shown through the test link.
- The fixed GitHub Pages test frontend URL is `https://09beedesign-star.github.io/artx-test/`.
- The fixed test backend URL is `https://backstage.artxsd.com`.
- Directly deploying `https://backstage.artxsd.com` is only a backend/server deployment and does not count as "提交到测试环境" unless the GitHub Pages test frontend is also updated and verified.
- Do not publish to the production site `https://www.artxsd.com`, push test changes to production branches, or push test changes to the `origin` production repository.
- Do not treat `test/main`, manually edited `gh-pages` artifacts, Manus temporary preview URLs, or Render URLs as the test release result.
- Do not use the old Render test backend `https://artx-test.onrender.com` as the default test/gray API backend.
- After publishing, verify `https://09beedesign-star.github.io/artx-test/deployment.json` and confirm `shortCommit` matches the pushed commit. Also verify `https://backstage.artxsd.com/api/health` and any backend/API path touched by the task.
- If any step fails, do not say the test environment has been submitted; state exactly which step is incomplete.
