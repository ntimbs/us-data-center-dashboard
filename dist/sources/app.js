(() => {
  const search = document.getElementById("sourceSearch");
  const cards = [...document.querySelectorAll(".source-card")];
  const groups = [...document.querySelectorAll(".source-group")];
  const sourceText = new Map(cards.map(card => [card, card.textContent.toLowerCase()]));
  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    let count = 0;
    cards.forEach(card => {
      card.hidden = !sourceText.get(card).includes(query);
      if (!card.hidden) count += 1;
    });
    groups.forEach(group => { group.hidden = !group.querySelector(".source-card:not([hidden])"); });
    document.getElementById("sourceCount").textContent = `${count} of ${cards.length} source entries`;
    document.getElementById("sourceEmpty").hidden = count > 0;
  });

  const billSearch = document.getElementById("billSearch");
  const rows = [...document.querySelectorAll("#bill-sources tbody tr")];
  const billText = new Map(rows.map(row => [row, [...row.cells].map(cell => cell.textContent).join(" ").toLowerCase()]));
  billSearch.addEventListener("input", () => {
    const terms = billSearch.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    rows.forEach(row => {
      row.hidden = !terms.every(term => billText.get(row).includes(term));
      if (!row.hidden) count += 1;
    });
    document.getElementById("billCount").textContent = `${count} of ${rows.length} bill records`;
    document.getElementById("billEmpty").hidden = count > 0;
  });

  document.querySelectorAll('.category-links a, a[href="#bill-sources"]').forEach(anchor => {
    anchor.addEventListener("click", () => {
      if (anchor.hash === "#bill-sources") {
        document.getElementById("billDetails").open = true;
      } else {
        search.value = "";
        search.dispatchEvent(new Event("input"));
      }
    });
  });
  if (location.hash === "#bill-sources") document.getElementById("billDetails").open = true;
})();
