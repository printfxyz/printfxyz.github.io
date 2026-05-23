(function () {
  const tools = Array.isArray(window.HTML_TOOLS) ? window.HTML_TOOLS : [];
  const grid = document.querySelector("#tool-grid");
  const count = document.querySelector("#tool-count");
  const emptyState = document.querySelector("#empty-state");
  const search = document.querySelector("#tool-search");

  function getSearchText(tool) {
    return [tool.name, tool.description, ...(tool.tags || [])]
      .join(" ")
      .toLowerCase();
  }

  function render(filteredTools) {
    grid.innerHTML = "";
    count.textContent = `${filteredTools.length} ${filteredTools.length === 1 ? "tool" : "tools"}`;
    emptyState.hidden = filteredTools.length !== 0;

    for (const tool of filteredTools) {
      const card = document.createElement("a");
      card.className = "tool-card";
      card.href = tool.path;

      const title = document.createElement("h3");
      title.textContent = tool.name;

      const description = document.createElement("p");
      description.textContent = tool.description;

      const tagRow = document.createElement("div");
      tagRow.className = "tag-row";

      for (const tag of tool.tags || []) {
        const badge = document.createElement("span");
        badge.className = "tag";
        badge.textContent = tag;
        tagRow.append(badge);
      }

      card.append(title, description, tagRow);
      grid.append(card);
    }
  }

  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    render(tools.filter((tool) => getSearchText(tool).includes(query)));
  });

  render(tools);
})();
