"""One conversational turn in its own process: load the GGUF, answer as JSON, close it.

Reads {"model_path", "settings", "messages"} as one JSON line on stdin and writes the model's JSON answer on stdout.
The process exits after the answer, so nothing of the model stays in memory.
"""
import json
import sys

from llama_cpp import Llama

# The answer Lumen's conversational mode needs: a reply for the chat, and a prompt or an image action to run.
ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "prompt": {"type": "string"},
        "image_action": {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": ["none", "vary_subtle", "vary_strong", "upscale_subtle", "animate"]},
                "image": {"type": "integer"},
            },
            "required": ["kind", "image"],
        },
    },
    "required": ["reply", "prompt", "image_action"],
}


def run(payload):
    settings = payload["settings"]
    model = Llama(model_path=payload["model_path"], n_gpu_layers=settings["n_gpu_layers"], n_ctx=settings["n_ctx"],
                  flash_attn=True, verbose=False)
    try:
        out = model.create_chat_completion(messages=payload["messages"], max_tokens=settings["max_tokens"],
                                           temperature=settings["temperature"],
                                           response_format={"type": "json_object", "schema": ANSWER_SCHEMA})
    finally:
        model.close()
    sys.stdout.write(out["choices"][0]["message"]["content"].strip() + "\n")


if __name__ == "__main__":
    run(json.loads(sys.stdin.readline()))
