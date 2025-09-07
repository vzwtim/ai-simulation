import os
import json
import urllib.request
import time
import random
from flask import Flask, request, jsonify, render_template
import threading

# ===== 設定 =====
PROVIDER = os.getenv("PROVIDER", "lmstudio")
LMSTUDIO_URL = os.getenv("LMSTUDIO_URL", "http://localhost:1234/v1/chat/completions")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")
MODEL = os.getenv("MODEL", "gpt-4o-mini-compat")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash-latest")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.7"))
CONVERSATION_PACE_SECONDS = 7 # AIの応答間隔（秒）

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static"),
)
app.config['SECRET_KEY'] = 'secret!'

# ===== 会話状態 =====
conversation_history = []
agents = []
last_processed_message_count = 0
background_task_started = False
auto_chat_enabled = False # 自動会話のデフォルトはOFF（手動でトリガー）

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

def gemini_chat(messages):
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set")

    # Flatten our simple [system, user] messages into a single user prompt
    system_txt = "\n".join([m.get("content", "") for m in messages if m.get("role") == "system"]) or ""
    user_txt = "\n".join([m.get("content", "") for m in messages if m.get("role") == "user"]) or ""
    full_prompt = (f"[SYSTEM]\n{system_txt}\n[/SYSTEM]\n\n{user_txt}").strip()

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": full_prompt}]
            }
        ],
        "generationConfig": {
            "temperature": TEMPERATURE,
            "maxOutputTokens": 400
        }
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read().decode("utf-8"))

    # Parse the first candidate text safely
    candidates = data.get("candidates") or []
    if not candidates:
        return ""
    parts = ((candidates[0] or {}).get("content") or {}).get("parts") or []
    text = parts[0].get("text", "").strip() if parts else ""
    return text

# ===== 1ターン生成ユーティリティ =====
def generate_one_ai_turn():
    """会話履歴を基に、1ターンだけエージェントの応答を生成して送信する。成功ならTrue。"""
    global last_processed_message_count
    if not agents:
        return False
    if not conversation_history:
        return False

    # 直前話者を除外（自分の発言に自分で返信しない）
    last_speaker_name = conversation_history[-1].get('name')
    eligible_agents = [a for a in agents if a.get('name') != last_speaker_name]
    if not eligible_agents:
        return False

    # 発言率で重み付き選択
    talkativeness_weights = [a.get('talkativeness', 1.0) for a in eligible_agents]
    agent_to_speak = random.choices(eligible_agents, weights=talkativeness_weights, k=1)[0]

    # 台本化
    transcript = ""
    for msg in conversation_history:
        speaker = msg.get("name", "ユーザー")
        transcript += f"{speaker}: {msg['content']}\n"

    response_length_instruction = agent_to_speak.get('response_length', '3文以内')
    system_prompt = (
        agent_to_speak["system"]
        + " 会話の流れを大切にし、他の参加者に話すときは@名前でメンションしてください。"
        + " 重要：自分自身の発言に返信する文章は書かないでください（自分宛の返信はしない）。"
    )
    user_prompt = (
        f"これはあなたと他の登場人物との会話の台本です。\n"
        f"--- 台本 --- \n{transcript}"
        f"--- 台本ここまで --- \n\n"
        f"今があなたの番です。台本の『あなた以外の』最新の発言に応答する形で、あなたの次のセリフだけを発言してください。"
        f"もし台本の最後の発言があなた自身なら、その一つ前の他者の発言に応答してください。自分の発言に自分で返信しないでください。"
        f"重要：回答は常に簡潔に、{response_length_instruction}でお願いします。"
        f"ラグにより見逃された質問があれば拾って回答してください。"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    print(f"--- {agent_to_speak['name']} is thinking... ---")
    try:
        if PROVIDER == "ollama":
            chat_func = ollama_chat
        elif PROVIDER == "gemini":
            chat_func = gemini_chat
        else:
            chat_func = lmstudio_chat
        ai_response_text = chat_func(messages)

        timestamp = time.strftime('%H:%M')
        new_message = {"role": "assistant", "content": ai_response_text, "name": agent_to_speak['name'], "timestamp": timestamp}
        conversation_history.append(new_message)
        print(f"{agent_to_speak['name']}: {ai_response_text}")
        return True
    except Exception as e:
        print(f"Error during AI call: {e}")
        return False

# ===== 見守りループ関数 =====
def conversation_loop():
    # Vercelではバックグラウンドループは使用しない
    pass

# ===== HTTPエンドポイント =====
@app.get("/")
def index():
    return render_template("local_index.html")

@app.get("/api/history")
def get_history():
    return jsonify(conversation_history)

@app.post("/api/update_agents")
def update_agents_http():
    global agents
    try:
        data = request.get_json(force=True) or {}
        agents = data
        return jsonify({"ok": True, "count": len(agents)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

@app.post("/api/send_message")
def send_message_http():
    try:
        data = request.get_json(force=True) or {}
        message_text = (data.get('text') or '').strip()
        user_name = data.get('name') or 'ユーザー'
        turns = int(data.get('turns') or 5)
        if not message_text:
            return jsonify({"ok": False, "error": "empty text"}), 400

        new_user_msg = {"role": "user", "content": message_text, "name": user_name, "timestamp": time.strftime('%H:%M')}
        conversation_history.append(new_user_msg)

        generated = []
        for _ in range(max(1, turns)):
            ok = generate_one_ai_turn()
            if not ok:
                break
            generated.append(conversation_history[-1])

        return jsonify({"ok": True, "generated": generated, "history": conversation_history})
    except Exception as e:
        print(f"Error in send_message: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500

@app.post("/api/simulate_turns")
def simulate_turns_http():
    try:
        data = request.get_json(force=True) or {}
        count = int(data.get('count') or 5)
        generated = []
        for _ in range(max(1, count)):
            ok = generate_one_ai_turn()
            if not ok:
                break
            generated.append(conversation_history[-1])
        return jsonify({"ok": True, "generated": generated, "history": conversation_history})
    except Exception as e:
        print(f"Error during simulate_turns: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    print(f"Starting server on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
