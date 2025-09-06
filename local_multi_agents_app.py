import os
import json
import urllib.request
import time
import random
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
CONVERSATION_PACE_SECONDS = 7 # AIの応答間隔（秒）

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static"),
)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, async_mode='threading')

# ===== 会話状態 =====
conversation_history = []
agents = []
last_processed_message_count = 0
background_task_started = False
auto_chat_enabled = True # 自動会話のデフォルトはON

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
    global last_processed_message_count
    while True:
        socketio.sleep(CONVERSATION_PACE_SECONDS)
        
        if auto_chat_enabled and len(conversation_history) > last_processed_message_count:
            if not agents or len(agents) < 1:
                continue

            last_processed_message_count = len(conversation_history)
            
            # --- 発言率に応じた加重ランダム選択 ---
            talkativeness_weights = [agent.get('talkativeness', 1.0) for agent in agents]
            agent_to_speak = random.choices(agents, weights=talkativeness_weights, k=1)[0]
            # -----------------------------------

            transcript = ""
            for msg in conversation_history:
                speaker = msg.get("name", "ユーザー")
                transcript += f"{speaker}: {msg['content']}\n"
            
            system_prompt = agent_to_speak["system"]
            response_length_instruction = agent_to_speak.get('response_length', '3文以内')

            user_prompt = (
                f"これはあなたと他の登場人物との会話の台本です。\n"
                f"--- 台本 --- \n{transcript}" 
                f"--- 台本ここまで --- \n\n"
                f"今があなたの番です。台本の最後の発言に応答する形で、あなたの次のセリフだけを発言してください。"
                f"重要：回答は常に簡潔に、{response_length_instruction}でお願いします。"
            )

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]

            print(f"--- {agent_to_speak['name']} is thinking... ---")
            try:
                chat_func = ollama_chat if PROVIDER == "ollama" else lmstudio_chat
                ai_response_text = chat_func(messages)
                
                new_message = {"role": "assistant", "content": ai_response_text, "name": agent_to_speak['name'], "timestamp": time.strftime('%H:%M')}
                conversation_history.append(new_message)
                socketio.emit('new_message', new_message)
                print(f"{agent_to_speak['name']}: {ai_response_text}")

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
    global agents, background_task_started
    agents = new_agents
    print(f"Agents updated: {agents}")
    if agents and not background_task_started:
        socketio.start_background_task(target=conversation_loop)
        background_task_started = True

@socketio.on('toggle_auto_chat')
def handle_toggle_auto_chat(data):
    global auto_chat_enabled
    auto_chat_enabled = data.get('enabled', True)
    status = "enabled" if auto_chat_enabled else "disabled"
    print(f"Auto-chat {status}")

@socketio.on('user_message')
def handle_user_message(data):
    message_text = data.get('text', '').strip()
    user_name = data.get('name', 'ユーザー')
    if not message_text:
        return

    new_message = {"role": "user", "content": message_text, "name": user_name, "timestamp": time.strftime('%H:%M')}
    conversation_history.append(new_message)
    emit('new_message', new_message, broadcast=True)
    print(f"{user_name}: {message_text}")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    print(f"Starting server on http://localhost:{port}")
    socketio.run(app, host="0.0.0.0", port=port, debug=True, allow_unsafe_werkzeug=True)

# Expose a WSGI-compatible application for platforms like Vercel
application = socketio.WSGIApp(socketio, app)
