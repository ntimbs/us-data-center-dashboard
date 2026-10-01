(() => {
  const tabs = [...document.querySelectorAll(".view-tabs [role='tab']")];
  const frame = document.getElementById("dashboardFrame");
  const title = document.getElementById("viewTitle");
  const description = document.getElementById("viewDescription");
  const openView = document.getElementById("openView");

  function selectView(tab) {
    tabs.forEach(item => item.setAttribute("aria-selected", String(item === tab)));
    frame.src = tab.dataset.src;
    frame.title = tab.dataset.title;
    title.textContent = tab.dataset.title;
    description.textContent = tab.dataset.description;
    openView.href = tab.dataset.src;
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectView(tab));
    tab.addEventListener("keydown", event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(index + direction + tabs.length) % tabs.length];
      next.focus();
      selectView(next);
    });
  });
})();
