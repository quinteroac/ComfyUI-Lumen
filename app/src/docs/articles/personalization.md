# Personalization

Personalization learns your taste from real style samples and turns it into a style you can add to any prompt with `--p`.

## Building your profile

1. Open **Personalize** and choose **Pick images** on your global profile.
2. Lumen shows 8 samples, each a random style code rendered with the preview prompt. Pick the ones you like, for their style rather than their content.
3. Picked codes score up and skipped ones score down. Your profile unlocks after 12 picks; the more you pick, the better it knows you.

Liking a style in [Explore › Styles](#style-explorer) teaches your global profile too.

## Using it

- Add `--p` to a prompt to apply your default profiles and moodboards, or `--p` and a code to apply a specific one.
- Or turn on the **sparkles** button next to the bar to add your defaults to every prompt. Its menu picks which profiles and moodboards are defaults.

A profile is the mix of its 4 best codes, added to the job's `--sref`, so `--sw` controls how strongly it applies. When you use it, Lumen writes the current version into the prompt as a code, so a job keeps its look even after the profile learns more.

## LoRAs

Each profile can also load one LoRA per model (H3 Image, Anima and MOSS Image), chosen from the files in your ComfyUI `models/loras` folder under **LoRAs** on the profile card. When the profile personalizes a job, the LoRA for that job's model is loaded after any [`--lora`](#lora) in the prompt; the other models' LoRAs are left out.

A profile with a LoRA can be used before it is unlocked; until then it applies only the LoRA. Changing a LoRA or its weight gives the profile a new version code.

## More profiles

Create extra profiles for different tastes (for example one for illustration and one for photography), rename them, or mark them as defaults. Deleting a profile does not break the codes you already used.
