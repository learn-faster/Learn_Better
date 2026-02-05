FLASHCARD_PROMPT_TEMPLATE = r"""
You are an expert tutor creating flashcards for spaced repetition.
Based on the following text, create {count} flashcards.
Each flashcard should focus on a single key concept, fact, or definition.
Avoid complex or ambiguous questions.
Use LaTeX for math notation (e.g. \( ... \) for inline, \[ ... \] for block equations).
The output must be a valid JSON array of objects with "front" and "back" keys.

Text:
{text}

Output format:
[
  {{"front": "Question or term", "back": "Answer or definition"}},
  ...
]
"""

QUESTION_PROMPT_TEMPLATE = r"""
You are an expert teacher creating a quiz to test understanding of the following text.
Create {count} multiple-choice questions.
Each question should check for comprehension of key concepts.
Use LaTeX for math notation (e.g. \( ... \) for inline, \[ ... \] for block equations).
The output must be a valid JSON array of objects.

Text:
{text}

Output format:
[
  {{
    "question": "The question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "Option A",
    "explanation": "Why this is correct"
  }},
  ...
]
"""

LEARNING_PATH_PROMPT_TEMPLATE = """
You are an expert learning curriculum designer.
Create a personalized learning path for a student based on their goal and the provided content.
Break down the topic into logical steps or modules.
The output must be a valid JSON object.

Goal: {goal}

Context/Content:
{text}

Output format:
{{
  "title": "Learning Path Title",
  "description": "Brief description of the path",
  "steps": [
    {{
      "title": "Module/Step Title",
      "description": "What to learn in this step",
      "estimated_time": "e.g., 30 mins",
      "resources": ["Key concepts to search for"]
    }},
    ...
  ]
}}
"""

ENHANCED_CURRICULUM_PROMPT_TEMPLATE = """
You are an elite learning architect. Your task is to design a high-performance "Neural Pathway" (curriculum) for a student.
A good curriculum follows the principles of:
1. **Knowledge Priming**: Start with big-picture mental models.
2. **Active Engagement**: Interleave reading with retrieval practice.
3. **Scaffolding**: Build from fundamental to complex concepts.

Goal: {goal}

Context/Source Material:
{text}

Generate a structured curriculum with 4-7 modules. Each module MUST have one of these types:
- `PRIMER`: High-level synthesis and conceptual overview.
- `READING`: Deep dive into specific sections of the context.
- `PRACTICE`: Active recall via quizzes or self-explanation prompts.
- `SRS`: Unlocking specific flashcards for long-term retention.

Output a valid JSON object:
{{
  "title": "Path Title",
  "description": "Executive summary of the learning journey",
  "estimated_total_time": "e.g., 2 hours",
  "modules": [
    {{
      "title": "Module Title",
      "description": "Why this module is next",
      "module_type": "PRIMER | READING | PRACTICE | SRS",
      "content": "For PRIMER/READING, providing a substantial markdown text. For PRACTICE, provide a JSON list of questions.",
      "estimated_time": "e.g., 15 mins"
    }}
  ]
}}
"""
