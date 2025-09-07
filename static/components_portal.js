document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('component-list');

  async function loadList() {
    try {
      const res = await fetch('/api/list_components');
      const comps = await res.json();
      listEl.innerHTML = '';
      comps.forEach(comp => {
        const tr = document.createElement('tr');

        const nameTd = document.createElement('td');
        nameTd.textContent = comp.name;
        tr.appendChild(nameTd);

        const authorTd = document.createElement('td');
        authorTd.textContent = comp.author || '';
        tr.appendChild(authorTd);

        const dateTd = document.createElement('td');
        dateTd.textContent = comp.uploaded_at || '';
        tr.appendChild(dateTd);

        const actionsTd = document.createElement('td');
        actionsTd.className = 'actions';

        const installBtn = document.createElement('button');
        installBtn.textContent = 'インストール';
        installBtn.className = 'action';
        installBtn.onclick = async () => {
          try {
            const r = await fetch(`/api/get_component?name=${encodeURIComponent(comp.name)}`);
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
        actionsTd.appendChild(installBtn);

        const editBtn = document.createElement('button');
        editBtn.textContent = '編集';
        editBtn.className = 'action';
        editBtn.onclick = async () => {
          try {
            const r = await fetch(`/api/get_component?name=${encodeURIComponent(comp.name)}`);
            const data = await r.json();
            const edited = prompt('コンポーネントJSONを編集', JSON.stringify(data, null, 2));
            if (edited) {
              const newData = JSON.parse(edited);
              await fetch('/api/upload_component', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newData)
              });
              loadList();
            }
          } catch (e) {
            console.warn('edit failed', e);
          }
        };
        actionsTd.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '削除';
        deleteBtn.className = 'action delete';
        deleteBtn.onclick = async () => {
          if (!confirm(`${comp.name}を削除しますか？`)) return;
          try {
            await fetch('/api/delete_component', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: comp.name })
            });
            loadList();
          } catch (e) {
            console.warn('delete failed', e);
          }
        };
        actionsTd.appendChild(deleteBtn);

        tr.appendChild(actionsTd);
        listEl.appendChild(tr);
      });
    } catch (e) {
      listEl.innerHTML = '<tr><td colspan="4">読み込み失敗</td></tr>';
    }
  }

  loadList();
});
