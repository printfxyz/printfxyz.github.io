(function () {
  const targets = document.querySelectorAll("[data-commit-version]");
  if (targets.length === 0) {
    return;
  }

  const repo = "printfxyz/printfxyz.github.io";
  const branch = "main";
  const apiUrl = `https://api.github.com/repos/${repo}/commits/${branch}`;

  function render(text, href, title) {
    for (const target of targets) {
      target.textContent = text;
      target.title = title || text;

      if (href && target.tagName === "A") {
        target.href = href;
      }
    }
  }

  async function loadCommit() {
    render("main @ loading");

    try {
      const response = await fetch(apiUrl, {
        headers: { Accept: "application/vnd.github+json" }
      });

      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`);
      }

      const data = await response.json();
      const sha = data && data.sha;
      if (!sha) {
        throw new Error("GitHub API response did not include a SHA.");
      }

      render(
        `main @ ${sha.slice(0, 7)}`,
        `https://github.com/${repo}/commit/${sha}`,
        sha
      );
    } catch (error) {
      render("main @ unavailable", `https://github.com/${repo}/commits/${branch}`);
      console.warn("Unable to load current commit.", error);
    }
  }

  loadCommit();
})();
