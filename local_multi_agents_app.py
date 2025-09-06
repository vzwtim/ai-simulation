import os, json, urllib.request
from flask import Flask, request, jsonify, render_template

# ===== 設定 =====
PROVIDER = os.getenv("PROVIDER", "lmstudio")  # "lmstudio" or "ollama"
LMSTUDIO_URL = os.getenv("LMSTUDIO_URL", "http://localhost:1234/v1/chat/completions")
OLLAMA_URL   = os.getenv("OLLAMA_URL",   "http://localhost:11434/api/chat")
MODEL        = os.getenv("MODEL", "gpt-4o-mini-compat")  # LM Studioでロードしたモデル名
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")
TEMPERATURE  = float(os.getenv("TEMPERATURE", "0.4"))

app = Flask(__name__, template_folder="templates", static_folder="static")

def lmstudio_chat(messages):
    payload = {"model": MODEL, "messages": messages, "temperature": TEMPERATURE, "max_tokens": 400}
    req = urllib.request.Request(LMSTUDIO_URL, data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"].strip()

def ollama_chat(messages):
    payload = {"model": OLLAMA_MODEL, "messages": messages, "options": {"temperature": TEMPERATURE}}
    req = urllib.request.Request(OLLAMA_URL, data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read().decode("utf-8"))
    return (data.get("message", {}) or {}).get("content", "").strip()

@app.get("/")
def index():
    return render_template("local_index.html")

@app.post("/chat")
def chat():
    data = request.get_json(force=True) or {}
    msg = (data.get("message") or "").strip()
    agents = data.get("agents") or []
    if not msg:
        return jsonify({"error":"message is required"}), 400
    if not agents:
        agents = [
            {"name": "ロジック担当", "system": "あなたは厳密な論理展開を好む助言者。前提を明示化し、手順で簡潔に答える。"},
            {"name": "創造担当",   "system": "あなたは発想の触媒。比喩と連想で3案を短く示す。"},
            {"name": "批評担当",   "system": "あなたは建設的な批評家。リスク・反例・落とし穴を3点で述べる。"},
        ]

    replies = []
    for ag in agents:
        messages = [
            {"role":"system","content": ag.get("system") or "あなたは有能なアシスタントです。"},
            {"role":"user","content": msg}
        ]
        try:
            text = ollama_chat(messages) if PROVIDER == "ollama" else lmstudio_chat(messages)
        except Exception as e:
            text = f"[エラー] {type(e).__name__}: {e}"
        replies.append({"name": ag.get("name") or "Agent", "text": text})
    return jsonify({"replies": replies})

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
