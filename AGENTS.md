# ArtX Test Release Rules

- When the user says "把当前任务发布到测试环境" or otherwise asks to publish to the test environment, first sync the latest `test/feature/interaction-framework`, then merge in the current task changes, verify, and push only to `test/feature/interaction-framework`.
- The fixed test frontend URL is `https://09beedesign-star.github.io/artx-test/`.
- The fixed test backend URL is `https://artx-test.onrender.com`.
- Do not publish to the production environment or push test changes to the `origin` production repository.
- Do not treat `test/main`, manually edited `gh-pages` artifacts, or Manus temporary preview URLs as the test release result.
- After publishing, verify `deployment.json` or `window.__ARTX_BUILD__` and confirm that the live `commitSha` matches `test/feature/interaction-framework`.
- If the user only says "发布到测试环境", follow this same sync, merge, verify, and push workflow.
