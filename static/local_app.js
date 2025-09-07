document.addEventListener('DOMContentLoaded', () => {
    // App elements
    const sendBtn = document.getElementById("send");
    const inputEl = document.getElementById("input");
    const messagesContainer = document.getElementById("messages");

    // General Settings elements
    const userNameInput = document.getElementById('user-name-input');
    const autoChatToggle = document.getElementById('auto-chat-toggle');
    const bgColorInput = document.getElementById('bg-color-input');
    const bgImageInput = document.getElementById('bg-image-input');

    // Agent Settings elements
    const settingsModal = document.getElementById('settings-modal');
    const settingsBtn = document.getElementById('settings-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const agentList = document.getElementById("agent-list");
    const addBtn = document.getElementById("add-agent");
    const componentSelect = document.getElementById('component-select');
    const componentNameInput = document.getElementById('component-name-input');
    const saveComponentBtn = document.getElementById('save-component');

    // RESTモード（Vercel）: Socket.IOは使わない
    let userName = userNameInput.value;
    let messageIndex = 0;
    let agents = [];

    // --- Settings Logic ---
    function loadSettings() {
        const savedBgColor = localStorage.getItem('chatBgColor');
        const savedBgImage = localStorage.getItem('chatBgImage');
        if (savedBgColor) {
            bgColorInput.value = savedBgColor;
            messagesContainer.style.backgroundColor = savedBgColor;
        }
        if (savedBgImage) {
            bgImageInput.value = savedBgImage;
            messagesContainer.style.backgroundImage = `url(${savedBgImage})`;
        }
    }

    userNameInput.addEventListener('input', (e) => { userName = e.target.value; });
    autoChatToggle.addEventListener('change', (e) => { /* no-op on Vercel */ });
    bgColorInput.addEventListener('input', (e) => { messagesContainer.style.backgroundColor = e.target.value; localStorage.setItem('chatBgColor', e.target.value); });
    bgImageInput.addEventListener('input', (e) => { const url = e.target.value.trim(); messagesContainer.style.backgroundImage = url ? `url(${url})` : 'none'; localStorage.setItem('chatBgImage', url); });

    // --- Modal Logic ---
    function openModal() { settingsModal.classList.add('visible'); }
    function closeModal() { settingsModal.classList.remove('visible'); }
    settingsBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeModal(); });

    // --- Agent Management ---
    async function updateAgentsOnServer() {
        try {
            await fetch('/api/update_agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(agents)
            });
        } catch (e) {
            console.warn('update_agents failed', e);
        }
    }
    function renderAgents() {
        agentList.innerHTML = "";
        agents.forEach((ag, idx) => {
            const row = document.createElement("div");
            row.className = "agent-row";
            row.innerHTML = `
                <div class="agent-config-grid">
                    <div class="agent-icon-picker">
                        <img src="${ag.icon}" class="config-avatar" alt="avatar">
                        <input type="color" class="color" value="${ag.color}">
                    </div>
                    <input class="name" value="${ag.name}" placeholder="名前">
                    <input class="icon-url" value="${ag.icon}" placeholder="画像URL">
                    <div class="setting-item-small">
                        <label>発言率: <span class="talk-value">${ag.talkativeness}</span></label>
                        <input type="range" class="talkativeness" min="0.1" max="3" step="0.1" value="${ag.talkativeness}">
                    </div>
                    <div class="setting-item-small">
                        <label>回答の長さ: <span class="response-length-value">${ag.response_length}</span>文字</label>
                        <input type="range" class="response-length" min="10" max="300" step="10" value="${ag.response_length}">
                    </div>
                    <textarea class="system" rows="4" placeholder="システム指示">${ag.system}</textarea>
                </div>
                <button class="del">削除</button>
            `;
            const talkValueSpan = row.querySelector(".talk-value");
            const responseLengthValueSpan = row.querySelector(".response-length-value");
            row.querySelector(".del").onclick = () => { agents.splice(idx, 1); renderAgents(); updateAgentsOnServer(); };
            row.querySelector(".icon-url").oninput = (e) => { agents[idx].icon = e.target.value; row.querySelector(".config-avatar").src = e.target.value; updateAgentsOnServer(); };
            row.querySelector(".color").oninput = (e) => { agents[idx].color = e.target.value; updateAgentsOnServer(); };
            row.querySelector(".name").oninput = (e) => { agents[idx].name = e.target.value; updateAgentsOnServer(); };
            row.querySelector(".talkativeness").oninput = (e) => { 
                agents[idx].talkativeness = parseFloat(e.target.value);
                talkValueSpan.textContent = e.target.value;
                updateAgentsOnServer(); 
            };
            row.querySelector(".response-length").oninput = (e) => { 
                agents[idx].response_length = parseInt(e.target.value);
                responseLengthValueSpan.textContent = e.target.value;
                updateAgentsOnServer(); 
            };
            row.querySelector(".system").oninput = (e) => { agents[idx].system = e.target.value; updateAgentsOnServer(); };
            agentList.appendChild(row);
        });
    }

    async function loadComponentList() {
        try {
            const res = await fetch('/api/list_components');
            const names = await res.json();
            componentSelect.innerHTML = '';
            names.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                componentSelect.appendChild(opt);
            });
            return names;
        } catch (e) {
            console.warn('list_components failed', e);
            return [];
        }
    }

    async function loadComponent(name) {
        try {
            const res = await fetch(`/api/get_component?name=${encodeURIComponent(name)}`);
            const data = await res.json();
            agents = data.agents || [];
            renderAgents();
            await updateAgentsOnServer();
        } catch (e) {
            console.warn('get_component failed', e);
        }
    }
    addBtn.onclick = async () => {
        agents.push({ name: "新しいエージェント", system: "あなたは有能なアシスタントです。会話の最後の発言に必ず応答してください。", icon: "https://placehold.co/40x40/ccc/fff?text=?", color: "#fd79a8", talkativeness: 1.0, response_length: 100 });
        renderAgents();
        await updateAgentsOnServer();
    };

    componentSelect.onchange = () => {
        const name = componentSelect.value;
        if (name) loadComponent(name);
    };

    saveComponentBtn.onclick = async () => {
        const name = componentNameInput.value.trim();
        if (!name) return;
        try {
            const res = await fetch('/api/upload_component', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, agents })
            });
            const result = await res.json();
            if (!result.ok) {
                console.warn('save_component error', result.error);
                return;
            }
            const savedName = result.name || name;
            const names = await loadComponentList();
            componentSelect.value = savedName;
            componentNameInput.value = '';
            await loadComponent(savedName);
        } catch (e) {
            console.warn('save_component failed', e);
        }
    };

    // --- Message & Socket Logic ---
    function addMessage(msg) {
        const isUser = msg.role === 'user';
        const agent = isUser ? null : agents.find(a => a.name === msg.name);
        const div = document.createElement("div");
        div.className = `message-wrapper ${msg.role}`;
        
        const icon = !isUser ? `<div class="avatar"><img src="${agent?.icon || 'https://placehold.co/40x40/ccc/fff?text=?'}" alt="avatar"></div>` : '';
        const header = !isUser ? `<div class="message-header"><span class="agent" style="color: ${agent?.color || '#888'}">${msg.name}</span></div>` : '';
        const content = msg.content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const time = msg.timestamp || new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });

        div.innerHTML = `
            ${icon}
            <div class="message-content">
                ${header}
                <div class="bubble-container">
                    <div class="bubble"><pre>${content}</pre></div>
                    <div class="timestamp-wrapper"><span class="timestamp">${time}</span></div>
                </div>
            </div>
        `;
        div.dataset.index = messageIndex++;
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async function sendMessage() {
        const text = inputEl.value.trim();
        if (!text) return;
        inputEl.value = "";
        inputEl.style.height = 'auto';

        const timestamp = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
        addMessage({ role: 'user', content: text, name: userName, timestamp });

        try {
            const res = await fetch('/api/send_message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, name: userName, turns: 5 })
            });
            const data = await res.json();
            if (data.ok) {
                const delayMs = 600;
                (data.generated || []).forEach((msg, idx) => {
                    setTimeout(() => addMessage(msg), delayMs * (idx + 1));
                });
            } else {
                console.error('send_message error', data.error);
            }
        } catch (e) {
            console.error('send_message failed', e);
        }
    }

    sendBtn.onclick = sendMessage;
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    inputEl.addEventListener('input', () => { inputEl.style.height = 'auto'; inputEl.style.height = (inputEl.scrollHeight) + 'px'; });

    // --- 初期ロード（履歴とエージェント設定送信） ---
    (async function init() {
        try {
            const historyRes = await fetch('/api/history');
            const history = await historyRes.json();
            messagesContainer.innerHTML = '';
            messageIndex = 0;
            (history || []).forEach(msg => addMessage(msg));
        } catch (e) {
            console.warn('history load failed', e);
        }
        const names = await loadComponentList();
        if (names.length) {
            componentSelect.value = names[0];
            await loadComponent(names[0]);
        } else {
            renderAgents();
            await updateAgentsOnServer();
        }
        loadSettings();
    })();
});
