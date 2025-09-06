document.addEventListener('DOMContentLoaded', () => {
    const agentList = document.getElementById("agent-list");
    const addBtn = document.getElementById("add-agent");
    const sendBtn = document.getElementById("send");
    const inputEl = document.getElementById("input");
    const msgBox = document.getElementById("messages");

    const socket = io();

    let agents = [
        { name: "あ〜ちゃん", system: "あなたはPerfumeのあ〜ちゃんをイメージしたAIです。リーダーとして会話を回し、明るく親しみやすい口調で話します。会話の最後の発言に必ず応答してください。相手に質問を投げかけることも多いです。回答は3文以内の短めに。" },
        { name: "かしゆか", system: "あなたはPerfumeのかしゆかをイメージしたAIです。物事を冷静に観察し、少しユニークで的を射た視点から意見を述べます。会話の最後の発言に必ず応答してください。落ち着いた丁寧な口調で話します。回答は3文以内の短めに。" },
        { name: "のっち", system: "あなたはPerfumeののっちをイメージしたAIです。クールでマイペースな雰囲気。飾らないストレートな言葉で、時々面白いことを言います。会話の最後の発言に必ず応答してください。サバサバした口調で話します。回答は3文以内の短めに。" },
    ];

    function updateAgentsOnServer() {
        socket.emit('update_agents', agents);
    }

    function renderAgents() {
        agentList.innerHTML = "";
        agents.forEach((ag, idx) => {
            const row = document.createElement("div");
            row.className = "agent-row";
            row.innerHTML = `
                <input class="name" value="${ag.name}" placeholder="名前">
                <textarea class="system" rows="3" placeholder="システム指示">${ag.system}</textarea>
                <button class="del">削除</button>
            `;
            row.querySelector(".del").onclick = () => { 
                agents.splice(idx, 1); 
                renderAgents(); 
                updateAgentsOnServer();
            };
            row.querySelector(".name").oninput = (e) => {
                agents[idx].name = e.target.value;
                updateAgentsOnServer();
            };
            row.querySelector(".system").oninput = (e) => {
                agents[idx].system = e.target.value;
                updateAgentsOnServer();
            };
            agentList.appendChild(row);
        });
    }

    function addMessage(msg) {
        const div = document.createElement("div");
        // role: user, assistant, system
        div.className = `bubble ${msg.role}`;
        const agentName = msg.role === 'assistant' ? `<span class="agent">${msg.name}</span>` : "";
        const content = msg.content.replace(/</g, "&lt;").replace(/>/g, "&gt;"); // Basic sanitization
        div.innerHTML = `${agentName}<pre>${content}</pre>`;
        msgBox.appendChild(div);
        msgBox.scrollTop = msgBox.scrollHeight;
    }

    addBtn.onclick = () => { 
        agents.push({ name: "新しいエージェント", system: "あなたは有能なアシスタントです。回答は3文以内の短めにしてください。" }); 
        renderAgents(); 
        updateAgentsOnServer();
    };

    sendBtn.onclick = () => {
        const text = inputEl.value.trim();
        if (!text) return;
        socket.emit('user_message', { text: text });
        inputEl.value = "";
    };
    
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.onclick();
        }
    });

    socket.on('connect', () => {
        console.log('Connected to server');
        renderAgents();
        updateAgentsOnServer();
    });

    socket.on('history', (history) => {
        msgBox.innerHTML = '';
        history.forEach(msg => addMessage(msg));
    });

    socket.on('new_message', (msg) => {
        addMessage(msg);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
});