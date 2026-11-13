"""Generate the demo voice clips with IndicF5 (run on a machine that can run the model, e.g. Google Colab with a GPU).
NOT tested by the TRISHUL author. Only clone voices of people who gave you permission.
Setup:  pip install git+https://github.com/ai4bharat/IndicF5.git soundfile numpy
        (log in to Hugging Face and accept the model terms: huggingface-cli login)
Use:    python generate_demo_clips.py  ->  copy the .wav files into client/public/demo-voices/
Each voice needs a short clean reference recording (5-10 s) and the exact words spoken in it."""
import json, numpy as np, soundfile as sf
from transformers import AutoModel

MANIFEST = "../client/public/demo-voices/manifest.json"
REFS = {  # voice id in manifest.json -> reference audio + exact transcript of that audio
    "father": {"audio": "refs/father.wav", "text": "WRITE THE EXACT WORDS SPOKEN IN father.wav"},
    "mother": {"audio": "refs/mother.wav", "text": "WRITE THE EXACT WORDS SPOKEN IN mother.wav"},
    "dad-hi": {"audio": "refs/dad-hi.wav", "text": "WRITE THE EXACT WORDS SPOKEN IN dad-hi.wav"},      # Hindi voice
    "friend-en": {"audio": "refs/friend-en.wav", "text": "WRITE THE EXACT WORDS SPOKEN IN friend-en.wav"},   # English voice
}
model = AutoModel.from_pretrained("ai4bharat/IndicF5", trust_remote_code=True)
for v in json.load(open(MANIFEST, encoding="utf-8"))["voices"]:
    ref = REFS[v["id"]]
    for clip in v["clips"]:
        audio = model(clip["text"], ref_audio_path=ref["audio"], ref_text=ref["text"])
        if audio.dtype == np.int16: audio = audio.astype(np.float32) / 32768.0
        sf.write(clip["file"], np.array(audio, dtype=np.float32), samplerate=24000)
        print("wrote", clip["file"])
