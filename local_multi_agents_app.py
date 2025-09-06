import os, json, urllib.request, time
from flask import Flask, request, jsonify, render_template
from flask_socketio import SocketIO, emit
import threading

# ===== 設定 =====
PROVIDER = os.getenv("PROVIDER", "lmstudio")
LMSTUDIO_URL = os.getenv("LMSTUDIO_URL", "http://localhost:1234/v1/chat/completions")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")
MODEL = os.getenv("MODEL", "gpt-4o-mini-compat")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.7"))
CONVERSATION_PACE_SECONDS = 5 # AIの応答間隔（秒）

app = Flask(__name__, template_folder="templates", static_folder="static")
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, async_mode='threading')

# ===== 会話状態 =====
conversation_history = []
agents = []
agent_turn_index = 0
last_processed_message_count = 0
background_task_started = False

# ===== LLM呼び出し関数 =====
def lmstudio_chat(messages):
    payload = {"model": MODEL, "messages": messages, "temperature": TEMPERATURE, "max_tokens": 400}
    req = urllib.request.Request(LMSTUDIO_URL, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"].strip()

def ollama_chat(messages):
    payload = {"model": OLLAMA_MODEL, "messages": messages, "options": {"temperature": TEMPERATURE}}
    req = urllib.request.Request(OLLAMA_URL, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read().decode("utf-8"))
    return (data.get("message", {}) or {}).get("content", "").strip()

# ===== 見守りループ関数 =====
def conversation_loop():
    global last_processed_message_count, agent_turn_index
    while True:
        socketio.sleep(CONVERSATION_PACE_SECONDS)
        
        if len(conversation_history) > last_processed_message_count:
            if not agents:
                continue

            last_processed_message_count = len(conversation_history)
            agent_to_speak = agents[agent_turn_index]
            
            # --- 新しい「台本」形式のプロンプトを作成 ---
            transcript = ""
            for msg in conversation_history:
                speaker = msg.get("name", "あなた") # 人間からの発言者を「あなた」とする
                transcript += f"{speaker}: {msg['content']}\n"
            
            system_prompt = agent_to_speak["system"]
            user_prompt = (
                f"これはあなたと他の登場人物との会話の台本です。\n"
                f"--- 台本 --- \n{transcript}" 
                f"--- 台本ここまで --- \n\n"
                f"今があなたの番です。台本の最後の発言に応答する形で、あなたの次のセリフだけを発言してください。"
            )

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
            # --- プロンプト作成ここまで ---

            print(f"--- {agent_to_speak['name']} is thinking... ---")
            try:
                chat_func = ollama_chat if PROVIDER == "ollama" else lmstudio_chat
                ai_response_text = chat_func(messages)
                
                new_message = {"role": "assistant", "content": ai_response_text, "name": agent_to_speak['name']}
                conversation_history.append(new_message)
                socketio.emit('new_message', new_message)
                print(f"{agent_to_speak['name']}: {ai_response_text}")

                agent_turn_index = (agent_turn_index + 1) % len(agents)

            except Exception as e:
                print(f"Error during AI call: {e}")
                last_processed_message_count -= 1
                socketio.emit('new_message', {"role": "system", "content": f"AI ({agent_to_speak['name']}) の応答生成中にエラーが発生しました: {e}"})

# ===== WebSocketイベントハンドラ =====
@app.get("/")
def index():
    return render_template("local_index.html")

@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('history', conversation_history)

@socketio.on('update_agents')
def handle_update_agents(new_agents):
    global agents, agent_turn_index, background_task_started
    agents = new_agents
    agent_turn_index = 0
    print(f"Agents updated: {agents}")
    if agents and not background_task_started:
        socketio.start_background_task(target=conversation_loop)
        background_task_started = True

@socketio.on('user_message')
def handle_user_message(data):
    global last_processed_message_count
    message_text = data.get('text', '').strip()
    if not message_text:
        return

    new_message = {"role": "user", "content": message_text}
    conversation_history.append(new_message)
    emit('new_message', new_message, broadcast=True)
    print(f"User: {message_text}")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    print(f"Starting server on http://localhost:{port}")
    socketio.run(app, host="0.0.0.0", port=port, debug=True, allow_unsafe_werkzeug=True)