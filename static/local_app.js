const agentList = document.getElementById("agent-list");
const addBtn = document.getElementById("add-agent");
const sendBtn = document.getElementById("send");
const inputEl = document.getElementById("input");
const msgBox = document.getElementById("messages");

let agents = [
  { name: "ロジック担当", system: "あなたは厳密な論理展開を好む助言者。前提を明示化し、手順で簡潔に答える。" },
  { name: "創造担当", system: "あなたは発想の触媒。比喩と連想で3案を短く示す。" },
  { name: "批評担当", system: "あなたは建設的な批評家。リスク・反例・落とし穴を3点で述べる。" },
];

function renderAgents() {
  agentList.innerHTML = "";
  agents.forEach((ag, idx) => {
    const row = document.createElement("div");
    row.className = "agent-row";
    row.innerHTML = `
      <input class="name" value="${ag.name}" placeholder="名前">
      <textarea class="system" rows="2" placeholder="システム指示">${ag.system}</textarea>
      <button class="del">削除</button>
    `;
    row.querySelector(".del").onclick = () => { agents.splice(idx,1); renderAgents(); };
    row.querySelector(".name").oninput = (e) => agents[idx].name = e.target.value;
    row.querySelector(".system").oninput = (e) => agents[idx].system = e.target.value;
    agentList.appendChild(row);
  });
}
renderAgents();

function addMessage(role, text, agentName=null) {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  const who = agentName ? `<span class="agent">${agentName}</span>` : "";
  div.innerHTML = `${who}<pre>${text}</pre>`;
  msgBox.appendChild(div);
  msgBox.scrollTop = msgBox.scrollHeight;
}

addBtn.onclick = () => { agents.push({ name:"新しいエージェント", system:"あなたは有能なアシスタントです。" }); renderAgents(); };

sendBtn.onclick = async () => {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  addMessage("user", text);

  sendBtn.disabled = true;
  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, agents })
    });
    const data = await res.json();
    if (data.error) { addMessage("system", "エラー: " + data.error); return; }
    (data.replies || []).forEach(r => addMessage("agent", r.text, r.name));
  } catch (e) {
    addMessage("system", "通信エラー: " + e.message);
  } finally {
    sendBtn.disabled = false;
  }
};
