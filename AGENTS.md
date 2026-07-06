# ArtX Test Release Rules

- When the user says "提交到测试环境", "发布到测试环境", "把当前任务发布到测试环境", or otherwise asks to publish to the test environment, first sync the latest `test/feature/interaction-framework`, then merge in the current task changes, run the necessary local checks, and push only to `test/feature/interaction-framework`.
- The fixed test frontend URL is `https://backstage.artxsd.com`.
- The fixed test backend URL is `https://backstage.artxsd.com`.
- GitHub Actions deploys `test/feature/interaction-framework` to the Tencent Cloud test/gray environment.
- Do not publish to the production site `https://www.artxsd.com`, push test changes to production branches, or push test changes to the `origin` production repository.
- Do not treat `test/main`, manually edited `gh-pages` artifacts, Manus temporary preview URLs, or Render URLs as the test release result.
- Do not use the old Render test backend `https://artx-test.onrender.com` as the default test/gray API backend.
- After publishing, verify `https://backstage.artxsd.com/deployment.json`, `/api/health`, login, AI image generation / Skill image generation, image proxy and downloads, and any Wallyt payment callback path touched by the task.
- If the user only says "发布到测试环境" or "提交到测试环境", follow this same sync, merge, local-check, push, and Tencent Cloud verification workflow.
