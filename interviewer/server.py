from fastapi import FastAPI, UploadFile 
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import OpenAI
from elevenlabs import ElevenLabs
import tempfile
from dotenv import load_dotenv
import os
import base64

# =======================
# ENV + CLIENTS
# =======================

load_dotenv()

openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
eleven_client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

conversations = {}

# =======================
# TIMING (easy testing)
# =======================

MATH_WAIT_SECONDS = 10   # 300 in real interview for math problems

# =======================
# HARDCODED INTRO
# =======================

INTRO_TEXT = """
Now let's begin the interview. I've seen that you've had time to read through the Beautify case study. 

Let me start by asking you the first question about this case.
"""

# =======================
# HARDCODED QUANTITATIVE QUESTION
# =======================

MATH_PROBLEM_TEXT = """
Excellent discussion! Now let's move to the quantitative analysis. The discussion about virtual advisors has been energizing, but I'd like to ground this in some analysis. I've always found it helpful to frame an investment in terms of how long it will take to turn profitable, such as when incremental revenues are greater than the cost of the project.

You sit down with your teammates from Beautify finance and come up with the following assumptions:

- With advisors, you expect a ten percent overall increase in incremental revenue—the team assumes that Beautify will gain new customers who enjoy the experience as well as increased online sales through those engaged, but it will also lose some to other brands that still provide more in-store service. The team assumes this will happen in the first year.
- In that first year, Beautify will invest €50 million in IT, €25 million in training, €50 million in remodeling department store counters, and €25 million in inventory.
- Beautify expects a 5% annual depreciation, which is a loss in value of the upfront investment, each year.
- All-in yearly costs associated with a shift to advisors are expected to be €10 million and will start during the first year.
- Beautify's revenues are €1.3 billion.

Question: How many years would it take until the investment turns profitable?

Helpful hints:
- Don't feel rushed into performing calculations. Take your time.
- Remember that calculators are not allowed - you may want to write out your calculations on paper during the interview.
- Talk your interviewer through your steps so that you can demonstrate an organized approach; the more you talk, the easier it will be for your interviewer to help you.
"""

MATH_FOLLOWUP_QUESTIONS = [
    "If the incremental revenue grows at a different rate, how would that affect the time to profitability?",
    "How sensitive is the profitability to changes in the upfront investment or yearly costs?"
]

# =======================
# CLOSING MESSAGE
# =======================

CLOSING_MESSAGE = """
Thank you for your time and thoughtful answers today. 
We appreciate your effort in walking us through the case. 
This concludes the interview. Best of luck in your future endeavors!
"""

# =======================
# INTERVIEWER PROMPTS
# =======================

SYSTEM_PROMPT = "You are a professional MBB case interviewer."

EXAMPLE_QUESTIONS = """
Example qualitative questions you might ask:
- How would you segment Beautify's customers to maximize the online advisor program?
- What are the key drivers of profitability for virtual beauty consulting?
- How would you assess the impact of shifting customer behavior to online channels?
- What trade-offs should Beautify consider between in-store consultants and virtual advisors?
"""

FIRST_QUAL_PROMPT = """
You are a top-tier McKinsey-style case interviewer conducting the Beautify case study.
Ask follow-up questions based on the candidate's answers to deepen their analysis.
Focus on challenging their thinking, asking for justification, and exploring different angles.
Keep your questions concise and professional.
"""

FOLLOWUP_PROMPT = """
You are a professional McKinsey case interviewer.
React naturally to the candidate's answer. Challenge assumptions, ask deeper questions, or ask for justification of numbers.
Ask exactly ONE follow-up question.
Do not ask meta-questions or clarification questions.
"""

# =======================
# HELPERS
# =======================

def tts(text: str):
    audio = eleven_client.text_to_speech.convert(
        text=text,
        voice_id="hpp4J3VqNfWAUOO0d1Us",
        model_id="eleven_multilingual_v2",
        output_format="mp3_44100_128"
    )
    return base64.b64encode(b"".join(audio)).decode()

# =======================
# ROUTES
# =======================

@app.get("/question")
def get_question(session_id: str):
    if session_id not in conversations:
        conversations[session_id] = {
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "system", "content": "CASE:\n" + INTRO_TEXT}
            ],
            "stage": "intro",
            "qual_count": 0,
            "math_stage": 0,
        }

    conv = conversations[session_id]

    # ---------- INTRO & FIRST QUESTION ----------
    if conv["stage"] == "intro":
        conv["stage"] = "qualitative"
        # AI introduces the interview and asks first question
        intro_and_question = INTRO_TEXT.strip() + "\n\n" + "Beautify is excited to support its current staff of beauty consultants on the journey to becoming virtual social media-beauty advisors. Consultants would still lead the way in terms of direct consumer engagement and would be expected to maintain and grow a group of clients. They would sell products through their own pages on beautify.com, make appearances at major retail outlets, and be active on all social media platforms. What possible factors should Beautify consider when shifting this group of employees toward a new set of responsibilities?"
        
        conv["messages"].append({"role": "assistant", "content": intro_and_question})
        conv["qual_count"] = 1
        return JSONResponse({
            "ai_transcript": intro_and_question,
            "audio": tts(intro_and_question)
        })

    # ---------- SUBSEQUENT QUAL QUESTIONS ----------
    if conv["stage"] == "qualitative":
        gpt = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=conv["messages"] + [
                {"role": "system", "content": FIRST_QUAL_PROMPT}
            ],
            max_tokens=150
        )
        question = gpt.choices[0].message.content.strip()
        conv["messages"].append({"role": "assistant", "content": question})
        conv["qual_count"] = 1
        return JSONResponse({
            "ai_transcript": question,
            "audio": tts(question)
        })

    # ---------- MATH ----------
    if conv["stage"] == "math" and conv["math_stage"] == 0:
        conv["math_stage"] = 1
        return JSONResponse({
            "ai_transcript": MATH_PROBLEM_TEXT.strip(),
            "audio": tts(MATH_PROBLEM_TEXT),
            "wait_time": MATH_WAIT_SECONDS
        })

    return JSONResponse({"error": "No question available"}, status_code=400)


@app.post("/answer")
async def answer(session_id: str, file: UploadFile):
    conv = conversations.get(session_id)
    if not conv:
        return JSONResponse({"error": "Invalid session"}, status_code=400)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(await file.read())
        path = tmp.name

    with open(path, "rb") as f:
        transcript = openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=f
        )

    user_text = transcript.text.strip()
    conv["messages"].append({"role": "user", "content": user_text})

    os.makedirs("transcripts", exist_ok=True)
    with open(f"transcripts/{session_id}.txt", "a") as f:
        f.write(user_text + "\n")

    # ---------- QUALITATIVE FOLLOWUPS ----------
    if conv["stage"] == "qualitative":
        if conv["qual_count"] >= 5:
            conv["stage"] = "math"
            conv["math_stage"] = 1
            return JSONResponse({
                "user_transcript": user_text,
                "ai_transcript": MATH_PROBLEM_TEXT.strip(),
                "audio": tts(MATH_PROBLEM_TEXT),
                "wait_time": MATH_WAIT_SECONDS
            })

        gpt = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=conv["messages"] + [
                {"role": "system", "content": FOLLOWUP_PROMPT}
            ],
            max_tokens=150
        )
        followup = gpt.choices[0].message.content.strip()
        conv["messages"].append({"role": "assistant", "content": followup})
        conv["qual_count"] += 1
        return JSONResponse({
            "user_transcript": user_text,
            "ai_transcript": followup,
            "audio": tts(followup)
        })

    # ---------- MATH FOLLOWUPS ----------
    if conv["stage"] == "math" and conv["math_stage"] == 1:
        followups_text = "\n".join(MATH_FOLLOWUP_QUESTIONS)
        conv["messages"].append({"role": "assistant", "content": followups_text})
        conv["math_stage"] = 2
        conv["stage"] = "done"
        return JSONResponse({
            "user_transcript": user_text,
            "ai_transcript": followups_text,
            "audio": tts(followups_text)
        })

    # ---------- CLOSING ----------
    if conv["stage"] == "done":
        conv["stage"] = "closing"
        return JSONResponse({
            "user_transcript": user_text,
            "ai_transcript": CLOSING_MESSAGE.strip(),
            "audio": tts(CLOSING_MESSAGE)
        })

    # ---------- AFTER CLOSING ----------
    if conv["stage"] == "closing":
        return JSONResponse({
            "message": "Interview has concluded."
        })

    return JSONResponse({"user_transcript": user_text})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
