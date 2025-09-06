document.addEventListener('DOMContentLoaded', () => {
    // App elements
    const messagesContainer = document.getElementById("messages");
    const sendBtn = document.getElementById("send");
    const inputEl = document.getElementById("input");

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

    const socket = io();
    let userName = userNameInput.value;
    let agents = [
        { name: "あ〜ちゃん", system: "あなたはPerfumeのあ〜ちゃんをイメージしたAIです。リーダーとして会話を回し、明るく親しみやすい口調で話します。会話の最後の発言に必ず応答してください。相手に質問を投げかけることも多いです。回答は3文以内の短めに。", icon: "https://placehold.co/40x40/ff8fab/white?text=A", color: "#ff8fab" },
        { name: "かしゆか", system: "あなたはPerfumeのかしゆかをイメージしたAIです。物事を冷静に観察し、少しユニークで的を射た視点から意見を述べます。会話の最後の発言に必ず応答してください。落ち着いた丁寧な口調で話します。回答は3文以内の短めに。", icon: "https://placehold.co/40x40/a29bfe/white?text=K", color: "#a29bfe" },
        { name: "のっち", system: "あなたはPerfumeののっちをイメージしたAIです。クールでマイペースな雰囲気。飾らないストレートな言葉で、時々面白いことを言います。会話の最後の発言に必ず応答してください。サバサバした口調で話します。回答は3文以内の短めに。", icon: "https://placehold.co/40x40/74b9ff/white?text=N", color: "#74b9ff" },
    ];

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
    autoChatToggle.addEventListener('change', (e) => { socket.emit('toggle_auto_chat', { enabled: e.target.checked }); });
    bgColorInput.addEventListener('input', (e) => {
        messagesContainer.style.backgroundColor = e.target.value;
        localStorage.setItem('chatBgColor', e.target.value);
    });
    bgImageInput.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        messagesContainer.style.backgroundImage = url ? `url(${url})` : 'none';
        localStorage.setItem('chatBgImage', url);
    });

    // --- Modal Logic ---
    function openModal() { settingsModal.classList.add('visible'); }
    function closeModal() { settingsModal.classList.remove('visible'); }
    settingsBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeModal(); });

    // --- Agent Management ---
    function updateAgentsOnServer() { socket.emit('update_agents', agents); }
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
                    <textarea class="system" rows="4" placeholder="システム指示">${ag.system}</textarea>
                </div>
                <button class="del">削除</button>
            `;
            row.querySelector(".del").onclick = () => { agents.splice(idx, 1); renderAgents(); updateAgentsOnServer(); };
            row.querySelector(".icon-url").oninput = (e) => { agents[idx].icon = e.target.value; row.querySelector(".config-avatar").src = e.target.value; updateAgentsOnServer(); };
            row.querySelector(".color").oninput = (e) => { agents[idx].color = e.target.value; updateAgentsOnServer(); };
            row.querySelector(".name").oninput = (e) => { agents[idx].name = e.target.value; updateAgentsOnServer(); };
            row.querySelector(".system").oninput = (e) => { agents[idx].system = e.target.value; updateAgentsOnServer(); };
            agentList.appendChild(row);
        });
    }
    addBtn.onclick = () => { 
        agents.push({ name: "新しいエージェント", system: "あなたは有能なアシスタントです。会話の最後の発言に必ず応答してください。回答は3文以内の短めに。", icon: "https://placehold.co/40x40/ccc/fff?text=?", color: "#fd79a8" }); 
        renderAgents(); 
        updateAgentsOnServer();
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
        const time = msg.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        div.innerHTML = `
            ${icon}
            <div class="message-content">
                ${header}
                <div class="bubble-container">
                    <div class="bubble">
                        <pre>${content}</pre>
                    </div>
                    <div class="timestamp-wrapper"><span class="timestamp">${time}</span></div>
                </div>
            </div>
        `;
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function sendMessage() {
        const text = inputEl.value.trim();
        if (!text) return;
        socket.emit('user_message', { text: text, name: userName });
        inputEl.value = "";
        inputEl.style.height = 'auto';
    }

    sendBtn.onclick = sendMessage;
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    inputEl.addEventListener('input', () => { inputEl.style.height = 'auto'; inputEl.style.height = (inputEl.scrollHeight) + 'px'; });

    // --- Socket Listeners ---
    socket.on('connect', () => {
        console.log('Connected to server');
        renderAgents();
        updateAgentsOnServer();
        loadSettings();
    });

    socket.on('history', (history) => { messagesContainer.innerHTML = ''; history.forEach(msg => addMessage(msg)); });
    socket.on('new_message', (msg) => { addMessage(msg); });
    socket.on('disconnect', () => { console.log('Disconnected from server'); });
});