# 🎯 HAWK Interview Practice Service

This is an AI-powered case interview practice service that provides realistic consulting interview simulation with voice interaction.

## Features

- **Voice-Based Interaction**: Record your answers and receive AI-generated follow-up questions
- **Professional Case Study**: Practice with the "Beautify" cosmetics case study (McKinsey-style)
- **Structured Interview Flow**:
  - Case introduction and reading time
  - Multiple qualitative questions with follow-ups
  - Quantitative analysis problem
  - Professional closing
- **Real-time Transcription**: All interactions are transcribed and saved
- **AI-Powered Questions**: Dynamic question generation using GPT-4o-mini
- **Text-to-Speech**: Natural voice responses using ElevenLabs

## Setup

### Prerequisites

- Python 3.8 or higher
- pip3
- OpenAI API key
- ElevenLabs API key

### Installation

1. **Automatic Setup (Recommended)**:
   ```bash
   # From the project root
   npm run setup:interview
   ```

2. **Manual Setup**:
   ```bash
   cd interviewer
   pip3 install -r requirements.txt
   ```

### Environment Variables

Create a `.env` file in the root directory with:

```bash
OPENAI_API_KEY=your_openai_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

## Usage

### Starting the Service

1. **Using npm script** (from project root):
   ```bash
   npm run dev:interview
   ```

2. **Direct Python execution**:
   ```bash
   cd interviewer
   python3 server.py
   ```

The service will start on `http://localhost:8001`

### Using the Interview Practice

1. Navigate to any lecture in HAWK
2. Go to the final "Interview Practice" chapter
3. Click on "Case Study Interview Simulation"
4. The React interface will connect to the Python service automatically
5. Click "Start Case Interview" to begin

### Interview Flow

1. **Introduction** (5 minutes reading time)
   - Beautify case study presentation
   - Background information and client goals

2. **Qualitative Phase** (5-7 questions)
   - Strategic questions about the case
   - Follow-up questions based on your responses
   - Focus on structured thinking and business analysis

3. **Quantitative Phase** (1 main problem)
   - Financial analysis with given assumptions
   - Math problem solving (no calculators allowed)
   - Follow-up sensitivity analysis questions

4. **Closing**
   - Professional interview conclusion
   - Performance summary

## API Endpoints

- `GET /question?session_id=<id>` - Get next interview question
- `POST /answer?session_id=<id>` - Submit audio answer (webm format)

## File Structure

```
interviewer/
├── server.py              # FastAPI backend
├── requirements.txt       # Python dependencies
├── transcripts/          # Interview transcripts (auto-generated)
└── README.md            # This file
```

## Dependencies

- **FastAPI**: Web framework for the API
- **OpenAI**: GPT-4o-mini for questions, Whisper for transcription
- **ElevenLabs**: Text-to-speech conversion
- **uvicorn**: ASGI server
- **python-dotenv**: Environment variable management
- **python-multipart**: File upload handling

## Troubleshooting

### Common Issues

1. **Port 8001 already in use**:
   - Change the port in `server.py` (line 289)
   - Update the API_BASE in `InterviewPractice.tsx`

2. **Microphone not working**:
   - Check browser permissions for microphone access
   - Ensure HTTPS in production (required for microphone API)

3. **Audio playback issues**:
   - Check ElevenLabs API key and quota
   - Verify browser supports audio playback

4. **Connection refused**:
   - Ensure the Python service is running on port 8001
   - Check firewall settings

### Environment Setup

Make sure you have both API keys:

- **OpenAI API Key**: Used for GPT-4o-mini (question generation) and Whisper (transcription)
- **ElevenLabs API Key**: Used for text-to-speech conversion

## Production Deployment

For production deployment, consider:

1. **Security**: Implement proper authentication
2. **Rate Limiting**: Add rate limits for API endpoints
3. **HTTPS**: Required for microphone access
4. **Scaling**: Use proper ASGI server like Gunicorn
5. **Monitoring**: Add logging and error tracking

## Customization

### Changing the Case Study

Edit the `INTRO_TEXT` and `MATH_PROBLEM_TEXT` constants in `server.py` to use different case studies.

### Modifying Interview Flow

Adjust the `conversations` state management in the `/answer` endpoint to change the interview structure.

### Voice Customization

Change the `voice_id` in the `tts()` function to use different ElevenLabs voices.

## License

Part of the HAWK learning platform.
