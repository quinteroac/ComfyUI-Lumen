# Conversational Mode

Describe your idea in your own words, in any language, and a local language model writes the prompt and runs it. Then ask for changes the way you would ask a person.

Turn it on with the **speech bubble** in the imagine bar. Type, or press the microphone to speak (voice uses [draft mode](#draft-mode)).

## What you can say

- An idea: "a lighthouse in a storm", "make it at night", "vertical, please".
- A change to the current prompt: "warmer", "no people", "swap the cat for a fox". The assistant edits the prompt and keeps the rest, parameters included.
- An action on the last result: "variation of image 2", "a stronger variation of the first one", "upscale 3", "animate 2".

Each reply shows the prompt it wrote. **Edit by hand** puts it in the bar, and **Start another conversation** clears the chat.

## How it runs

The assistant is a GGUF model that runs with llama-cpp-python. For each message Lumen unloads ComfyUI's models, loads the GGUF in a separate process, answers and closes it, so no memory stays in use. While it answers no workflows start, and it waits if the ComfyUI queue is busy.

Pick the model and its settings on the [ComfyUI page](#comfyui-settings), under **Conversational mode (GGUF)**. Models are read from `models/LLM`.
