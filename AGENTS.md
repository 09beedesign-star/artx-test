# ArtX Test Release Rules

- When the user says "提交到测试环境", "发布到测试环境", "把当前任务发布到测试环境", or otherwise asks to publish to the test environment, the required path is: local code commit -> push to GitHub branch `feature/interaction-framework` -> GitHub Pages / test frontend redeploy -> sync the Tencent Cloud frontend page -> verify both online frontend versions.
- Unless the user explicitly says to generate a local test link, do not bypass GitHub for test-environment publishing.
- Tencent Cloud replaces the old Render backend and also serves a frontend page at `https://backstage.artxsd.com`; all frontend and backend code changes must still be committed and pushed to GitHub first, then the Tencent Cloud frontend page must be synchronized from that pushed code so it shows the same latest effect.
- The fixed GitHub Pages test frontend URL is `https://09beedesign-star.github.io/artx-test/`.
- The fixed Tencent Cloud frontend URL is `https://backstage.artxsd.com/`.
- The fixed test backend URL is `https://backstage.artxsd.com`.
- Directly deploying `https://backstage.artxsd.com` without first pushing `feature/interaction-framework` to GitHub does not count as "提交到测试环境".
- Do not publish to the production site `https://www.artxsd.com`, push test changes to production branches, or push test changes to the `origin` production repository.
- Do not treat `test/main`, manually edited `gh-pages` artifacts, Manus temporary preview URLs, or Render URLs as the test release result.
- Do not use the old Render test backend `https://artx-test.onrender.com` as the default test/gray API backend.
- After publishing, verify `https://09beedesign-star.github.io/artx-test/deployment.json` and `https://backstage.artxsd.com/deployment.json`; both `shortCommit` values must match the pushed commit. Also verify `https://backstage.artxsd.com/api/health` and any backend/API path touched by the task.
- If any step fails, do not say the test environment has been submitted; state exactly which step is incomplete.
