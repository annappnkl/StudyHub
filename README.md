# StudyHub

A personalized, adaptable study platform that generates comprehensive learning materials and interactive exercises using LLM-powered content generation.

## Features

- **Dynamic Study Plans**: Generate complete lecture roadmaps based on your learning goals
- **Adaptive Learning Materials**: LLM categorizes and formats content optimally (processes, frameworks, definitions, concepts, comparisons)
- **Interactive Practice Exercises**: Embedded exercises with LLM-powered evaluation and feedback
- **Structured Learning**: Introduction → Learning Materials → Practice → Quiz flow
- **Progress Tracking**: Chapter and subchapter completion tracking with unlock system

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js
- **AI**: OpenAI API (GPT-4o-mini)
- **Styling**: CSS3 with modern design

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   Create a `.env` file in the root directory:
   ```
   OPENAI_API_KEY=your-api-key-here
   PORT=8787
   VITE_API_BASE_URL=http://localhost:8787
   ```

3. **Start the development servers**:
   
   Terminal 1 (Backend API):
   ```bash
   npm run dev:api
   ```
   
   Terminal 2 (Frontend):
   ```bash
   npm run dev
   ```

4. **Open your browser**:
   Navigate to the URL shown in the frontend terminal (usually `http://localhost:5173`)

## Project Structure

```
StudyHub/
├── server/
│   └── index.js          # Express API server with OpenAI integration
├── src/
│   ├── App.tsx           # Main application component
│   ├── App.css           # Application styles
│   ├── api.ts            # API client functions
│   ├── types.ts          # TypeScript type definitions
│   └── ...
├── .env                  # Environment variables (not committed)
└── package.json         # Dependencies and scripts
```

## How It Works

1. **Create a Lecture**: Enter a topic and learning goal
2. **Generate Plan**: LLM creates a structured study plan with chapters and subchapters
3. **Learn**: Each subchapter includes:
   - Introduction
   - Categorized learning materials (processes, frameworks, etc.)
   - Interactive practice exercises with LLM evaluation
4. **Quiz**: Final quiz section tests overall understanding
5. **Progress**: Complete subchapters to unlock next chapters

## API Endpoints

- `POST /api/plan` - Generate study plan
- `POST /api/learning-sections` - Generate learning sections
- `POST /api/learning-sections-enhancement` - Categorize and format sections
- `POST /api/practice-exercise-refine` - Refine practice exercises
- `POST /api/practice-exercise-evaluate` - Evaluate practice answers
- `POST /api/exercises` - Generate quiz exercises
- `POST /api/evaluate` - Evaluate quiz answers

## Security Note

⚠️ **Important**: Never commit your `.env` file or API keys to version control. The `.env` file is already in `.gitignore`.

## License

MIT
