document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('component-list');

  async function loadList() {
    try {
      const res = await fetch('/api/list_components');
      const names = await res.json();
      listEl.innerHTML = '';
      names.forEach(name => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.textContent = 'インストール';
        btn.onclick = async () => {
          try {
            const r = await fetch(`/api/get_component?name=${encodeURIComponent(name)}`);
            const data = await r.json();
            if (data.agents) {
              await fetch('/api/update_agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data.agents)
              });
              window.location.href = '/';
            }
          } catch (e) {
            console.warn('install failed', e);
          }
        };
        li.textContent = name + ' ';
        li.appendChild(btn);
        listEl.appendChild(li);
      });
    } catch (e) {
      listEl.innerHTML = '<li>読み込み失敗</li>';
    }
  }

  loadList();
});
